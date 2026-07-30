const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { google } = require('googleapis');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'Sheet1';
const SHEET_ID = process.env.GOOGLE_SHEET_ID || process.env.SPREADSHEET_ID;
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_APP_PASSWORD = process.env.EMAIL_APP_PASSWORD;

app.use(cors());
app.use(express.json());

function validateEnv() {
  const missing = [];
  if (!GOOGLE_CLIENT_EMAIL) {
    missing.push('GOOGLE_CLIENT_EMAIL or GOOGLE_SERVICE_ACCOUNT_EMAIL');
  }
  if (!GOOGLE_PRIVATE_KEY) {
    missing.push('GOOGLE_PRIVATE_KEY');
  }
  if (!SHEET_ID) {
    missing.push('GOOGLE_SHEET_ID or SPREADSHEET_ID');
  }
  if (!EMAIL_USER) {
    missing.push('EMAIL_USER');
  }
  if (!EMAIL_APP_PASSWORD) {
    missing.push('EMAIL_APP_PASSWORD');
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

async function getSheetsClient() {
  validateEnv();

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: GOOGLE_CLIENT_EMAIL,
      private_key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

async function getSubscriptions() {
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A2:I`
  });

  const rows = response.data.values || [];

  return rows.map((row, index) => ({
    rowNumber: index + 2,
    CustomerName: row[0] || '',
    EmailAddress: row[1] || '',
    TotalMeals: Number(row[2] || 0),
    MealsRemaining: Number(row[3] || 0),
    StartDate: row[4] || '',
    MealPrice: row[5] || '',
    LastDeliveredDate: row[6] || '',
    MealsPerDay: Number(row[7] || 1),
    MealsDeliveredToday: Number(row[8] || 0)
  }));
}

async function deductMeal(rowNumber, mealsToDeduct = 1) {
  const normalizedRow = Number(rowNumber);
  if (!Number.isInteger(normalizedRow) || normalizedRow < 2) {
    throw new Error('rowNumber must be an integer >= 2');
  }

  const deductAmount = Math.max(1, Number(mealsToDeduct) || 1);

  const sheets = await getSheetsClient();
  const targetCell = `${SHEET_NAME}!D${normalizedRow}`;

  const readResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: targetCell
  });

  const currentValue = Number(readResponse.data.values?.[0]?.[0] || 0);
  if (currentValue <= 0) {
    throw new Error('No meals remaining to deduct');
  }

  const updatedValue = Math.max(currentValue - deductAmount, 0);

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: targetCell,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[updatedValue]]
    }
  });

  return updatedValue;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendBrevoEmail(toEmail, toName, subject, htmlContent) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      sender: { name: 'Cafe Salado', email: process.env.EMAIL_USER },
      to: [{ email: toEmail, name: toName }],
      subject,
      htmlContent
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Brevo API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

app.get('/api/subscriptions', async (req, res) => {
  try {
    const subscriptions = await getSubscriptions();
    return res.json({ success: true, data: subscriptions });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch subscriptions',
      error: error.message
    });
  }
});

app.post('/api/mark-delivered', async (req, res) => {
  try {
    const {
      rowNumber,
      CustomerName,
      EmailAddress,
      MealsRemaining,
      TotalMeals,
      StartDate,
      MealPrice,
      mealsToDeduct = 1
    } = req.body;

    const requiredFields = ['rowNumber', 'CustomerName', 'EmailAddress', 'MealsRemaining', 'TotalMeals', 'StartDate', 'MealPrice'];
    const missingFields = requiredFields.filter((fieldName) => {
      const fieldValue = req.body[fieldName];
      return fieldValue === undefined || fieldValue === null || fieldValue === '';
    });

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    const updatedMealsRemaining = await deductMeal(rowNumber, mealsToDeduct);

    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[today.getMonth()];
    const year = today.getFullYear();
    const todayFormatted = `${day}-${month}-${year}`;

    const sheets = await getSheetsClient();
    const ghiRead = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!G${rowNumber}:I${rowNumber}`
    });
    const ghiValues = ghiRead.data.values?.[0] || [];
    const currentLastDelivered = ghiValues[0] || '';
    const currentMealsPerDay = ghiValues[1] || '';
    const currentMealsDeliveredToday = Number(ghiValues[2] || 0);

    let newMealsDeliveredToday;
    if (currentLastDelivered === todayFormatted) {
      newMealsDeliveredToday = currentMealsDeliveredToday + Number(mealsToDeduct);
    } else {
      newMealsDeliveredToday = Number(mealsToDeduct);
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!G${rowNumber}:I${rowNumber}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[todayFormatted, currentMealsPerDay, newMealsDeliveredToday]]
      }
    });

    const priorMeals = Number(MealsRemaining) || 0;
    const newMealsRemaining = Number.isFinite(updatedMealsRemaining)
      ? updatedMealsRemaining
      : Math.max(priorMeals - mealsToDeduct, 0);
    const safeCustomerName = escapeHtml(CustomerName);
    const safeStartDate = escapeHtml(StartDate);
    const safeMealPrice = escapeHtml(MealPrice);
    const safeTotalMeals = Number(TotalMeals) || 0;

    const htmlBody = `
      <div style="font-family: Arial, Helvetica, sans-serif; background: #f8fafc; padding: 28px 16px;">
        <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);">
          <div style="padding: 22px 24px; border-bottom: 1px solid #e2e8f0; background: linear-gradient(135deg, #0f172a, #1e293b); color: #f8fafc;">
            <h2 style="margin: 0; font-size: 22px; font-weight: 700;">Cafe Salado Daily Delivery Receipt</h2>
          </div>
          <div style="padding: 24px; color: #0f172a; line-height: 1.6;">
            <p style="margin: 0 0 16px; font-size: 15px;">Hello ${safeCustomerName}, your meal for today has been successfully delivered!</p>
            <div style="border: 1px solid #dbeafe; background: #f8fbff; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
              <p style="margin: 0 0 8px; font-size: 14px; color: #334155;"><strong>Status:</strong> Delivered ${mealsToDeduct} meal(s) today</p>
              <p style="margin: 0 0 8px; font-size: 14px; color: #334155;"><strong>Subscription Started:</strong> ${safeStartDate}</p>
              <p style="margin: 0; font-size: 14px; color: #334155;"><strong>Cost of your Subscription:</strong> ${safeMealPrice}</p>
            </div>
            <p style="margin: 0; font-size: 16px; font-weight: 700; color: #0f172a;">You have ${newMealsRemaining} out of ${safeTotalMeals} meals remaining.</p>
            <div style="margin-top: 24px; padding: 16px; border: 1px solid #fde68a; background: #fffbeb; border-radius: 12px;">
              <p style="margin: 0; font-size: 14px; color: #92400e; line-height: 1.5;">🌟 Enjoying your meals? Share the love! Show this email at Cafe Salado for 10% off any in-store coffee or pastry. Follow us on Instagram @CafeSalado for daily fresh updates!</p>
            </div>
            <div style="margin-top: 25px; padding: 20px; background-color: #ecfdf5; border-radius: 12px; text-align: center;">
              <h3 style="color: #047857; margin-top: 0;">✨ Loving your daily Salado?</h3>
              <p style="color: #065f46; font-size: 14px;">We love making it for you! Come say hi in person—show this email at the cafe for a special surprise on us. 🥗☕</p>
              <p style="color: #065f46; font-size: 14px; font-weight: bold;">Catch our daily fresh vibes and behind-the-scenes fun on Instagram: <a href="https://instagram.com/saladocafenelamangala" style="color: #059669;">@saladocafenelamangala</a> 📸</p>
            </div>
          </div>
        </div>
      </div>
    `;

    console.log(`[mark-delivered] Sending email to ${EmailAddress} for ${CustomerName}`);
    try {
      const brevoData = await sendBrevoEmail(EmailAddress, CustomerName, '✅ Cafe Salado: Your Meal is Delivered!', htmlBody);
      console.log(`[mark-delivered] Email sent successfully via Brevo: ${brevoData.messageId}`);
    } catch (emailError) {
      console.error(`[mark-delivered] Email send failed for ${EmailAddress}:`, emailError);
      return res.status(500).json({
        success: false,
        message: 'Failed to send email notification',
        error: emailError.message
      });
    }

    return res.json({
      success: true,
      message: 'Meal marked as delivered and email notification sent',
      data: {
        rowNumber,
        CustomerName,
        EmailAddress,
        MealsRemaining: newMealsRemaining,
        TotalMeals: safeTotalMeals,
        StartDate,
        MealPrice,
        mealsToDeduct,
        MealsDeliveredToday: newMealsDeliveredToday
      }
    });
  } catch (error) {
    console.error('[mark-delivered] Error while processing delivery notification:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to mark meal as delivered',
      error: error.message
    });
  }
});

app.post('/api/update-subscription', async (req, res) => {
  try {
    const { rowNumber, CustomerName, EmailAddress, TotalMeals, MealsRemaining, StartDate, MealPrice, MealsPerDay } = req.body;

    const requiredFields = ['rowNumber', 'CustomerName', 'EmailAddress', 'TotalMeals', 'MealsRemaining', 'StartDate', 'MealPrice', 'MealsPerDay'];
    const missingFields = requiredFields.filter((fieldName) => {
      const fieldValue = req.body[fieldName];
      return fieldValue === undefined || fieldValue === null || fieldValue === '';
    });

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A${rowNumber}:H${rowNumber}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[CustomerName, EmailAddress, TotalMeals, MealsRemaining, StartDate, MealPrice, '', MealsPerDay]]
      }
    });

    return res.json({
      success: true,
      message: 'Subscription updated successfully',
      data: { rowNumber, CustomerName, EmailAddress, TotalMeals, MealsRemaining, StartDate, MealPrice, MealsPerDay }
    });
  } catch (error) {
    console.error('[update-subscription] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update subscription',
      error: error.message
    });
  }
});

app.post('/api/send-ended-email', async (req, res) => {
  try {
    const { CustomerName, EmailAddress } = req.body;

    if (!CustomerName || !EmailAddress) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: CustomerName, EmailAddress'
      });
    }

    const safeName = escapeHtml(CustomerName);

    const htmlBody = `
      <div style="font-family: Arial, Helvetica, sans-serif; background: #f8fafc; padding: 28px 16px;">
        <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);">
          <div style="padding: 22px 24px; border-bottom: 1px solid #e2e8f0; background: linear-gradient(135deg, #0f172a, #1e293b); color: #f8fafc;">
            <h2 style="margin: 0; font-size: 22px; font-weight: 700;">Subscription Completed 🎉</h2>
          </div>
          <div style="padding: 24px; color: #0f172a; line-height: 1.6;">
            <p style="margin: 0 0 16px; font-size: 15px;">Hello ${safeName},</p>
            <p style="margin: 0 0 16px; font-size: 15px;">We hope you've enjoyed every meal! Your Cafe Salado subscription has now run its course and all your meals have been delivered.</p>
            <p style="margin: 0 0 16px; font-size: 15px;">It has been an absolute pleasure serving you. We would love to have you back! To start a new subscription, simply visit us at the cafe or reach out to us, and we'll get you set up right away.</p>
            <div style="border: 1px solid #dbeafe; background: #f8fbff; border-radius: 12px; padding: 16px; margin-bottom: 16px; text-align: center;">
              <p style="margin: 0 0 8px; font-size: 16px; font-weight: 700; color: #0f172a;">Ready for more?</p>
              <p style="margin: 0; font-size: 14px; color: #334155;">Come visit us at B.H Road, Binnamangala or follow us on Instagram <a href="https://instagram.com/saladocafenelamangala" style="color: #059669;">@saladocafenelamangala</a> for fresh updates!</p>
            </div>
            <p style="margin: 0; font-size: 14px; color: #334155;">Warm regards,<br>The Cafe Salado Team</p>
          </div>
        </div>
      </div>
    `;

    console.log(`[send-ended-email] Sending ended email to ${EmailAddress} for ${CustomerName}`);
    const brevoData = await sendBrevoEmail(EmailAddress, CustomerName, '🍽️ Your Cafe Salado Subscription has ended!', htmlBody);
    console.log(`[send-ended-email] Email sent successfully via Brevo: ${brevoData.messageId}`);

    return res.json({
      success: true,
      message: 'Subscription ended email sent successfully'
    });
  } catch (error) {
    console.error('[send-ended-email] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send ended email',
      error: error.message
    });
  }
});

app.post('/api/add-subscription', async (req, res) => {
  try {
    const { CustomerName, EmailAddress, TotalMeals, StartDate, MealPrice, MealsPerDay } = req.body;

    const requiredFields = ['CustomerName', 'EmailAddress', 'TotalMeals', 'StartDate', 'MealPrice', 'MealsPerDay'];
    const missingFields = requiredFields.filter((fieldName) => {
      const fieldValue = req.body[fieldName];
      return fieldValue === undefined || fieldValue === null || fieldValue === '';
    });

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:H`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[CustomerName, EmailAddress, Number(TotalMeals), Number(TotalMeals), StartDate, MealPrice, '', Number(MealsPerDay)]]
      }
    });

    const safeName = escapeHtml(CustomerName);
    const safeTotal = Number(TotalMeals) || 0;
    const safeStartDate = escapeHtml(StartDate);
    const safeMealPrice = escapeHtml(MealPrice);

    const htmlBody = `
      <div style="font-family: Arial, Helvetica, sans-serif; background: #f8fafc; padding: 28px 16px;">
        <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);">
          <div style="padding: 22px 24px; border-bottom: 1px solid #e2e8f0; background: linear-gradient(135deg, #0f172a, #1e293b); color: #f8fafc;">
            <h2 style="margin: 0; font-size: 22px; font-weight: 700;">Welcome to Cafe Salado! 🎉</h2>
          </div>
          <div style="padding: 24px; color: #0f172a; line-height: 1.6;">
            <p style="margin: 0 0 16px; font-size: 15px;">Hello ${safeName},</p>
            <p style="margin: 0 0 16px; font-size: 15px;">Thank you for subscribing to Cafe Salado! Your meal subscription is now active and we are thrilled to have you on board.</p>
            <div style="border: 1px solid #dbeafe; background: #f8fbff; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
              <p style="margin: 0 0 8px; font-size: 14px; color: #334155;"><strong>Subscription Start Date:</strong> ${safeStartDate}</p>
              <p style="margin: 0 0 8px; font-size: 14px; color: #334155;"><strong>Total Meals:</strong> ${safeTotal}</p>
              <p style="margin: 0; font-size: 14px; color: #334155;"><strong>Meal Price:</strong> ${safeMealPrice}</p>
            </div>
            <p style="margin: 0 0 16px; font-size: 15px;">We will deliver fresh, delicious meals right to you every day. Stay tuned for your daily delivery notifications!</p>
            <p style="margin: 0; font-size: 14px; color: #334155;">Follow us on Instagram <a href="https://instagram.com/saladocafenelamangala" style="color: #059669;">@saladocafenelamangala</a> for daily fresh updates! 📸</p>
          </div>
        </div>
      </div>
    `;

    console.log(`[add-subscription] Sending welcome email to ${EmailAddress} for ${CustomerName}`);
    const brevoData = await sendBrevoEmail(EmailAddress, CustomerName, 'Welcome to Cafe Salado! Your subscription is now active 🥗', htmlBody);
    console.log(`[add-subscription] Welcome email sent successfully via Brevo: ${brevoData.messageId}`);

    return res.json({
      success: true,
      message: 'Subscription added and welcome email sent',
      data: { CustomerName, EmailAddress, TotalMeals: Number(TotalMeals), MealsRemaining: Number(TotalMeals), StartDate, MealPrice, MealsPerDay: Number(MealsPerDay) }
    });
  } catch (error) {
    console.error('[add-subscription] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add subscription',
      error: error.message
    });
  }
});

app.get('/api/sales-data', async (req, res) => {
  try {
    const salesSheetId = process.env.SALES_SPREADSHEET_ID;
    if (!salesSheetId) {
      return res.status(400).json({
        success: false,
        message: 'Missing SALES_SPREADSHEET_ID environment variable'
      });
    }

    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: salesSheetId,
      range: 'Sales_Master!A2:D'
    });

    const rows = response.data.values || [];

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const dailyRecords = [];
    let totalSales = 0;
    let totalGoal = 0;

    rows.forEach((row) => {
      const dateStr = row[0] || '';
      if (!dateStr) return;

      const parsed = new Date(dateStr);
      if (isNaN(parsed.getTime())) return;

      if (parsed.getMonth() === currentMonth && parsed.getFullYear() === currentYear) {
        const sales = Number(row[1] || 0);
        const goal = Number(row[2] || 0);
        const pct = Number(row[3] || 0);

        dailyRecords.push({
          Date: dateStr,
          DailySales: sales,
          DailyGoal: goal,
          PctAchieved: pct
        });

        totalSales += sales;
        totalGoal += goal;
      }
    });

    const dailyGoal = dailyRecords.length > 0
      ? dailyRecords[dailyRecords.length - 1].DailyGoal
      : 0;

    const monthlyProgress = totalGoal > 0
      ? Number(((totalSales / totalGoal) * 100).toFixed(1))
      : 0;

    return res.json({
      success: true,
      data: { dailyRecords, totalSales, dailyGoal, monthlyProgress }
    });
  } catch (error) {
    console.error('[sales-data] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch sales data',
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
