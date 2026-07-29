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
    range: `${SHEET_NAME}!A2:F`
  });

  const rows = response.data.values || [];

  return rows.map((row, index) => ({
    rowNumber: index + 2,
    CustomerName: row[0] || '',
    EmailAddress: row[1] || '',
    TotalMeals: Number(row[2] || 0),
    MealsRemaining: Number(row[3] || 0),
    StartDate: row[4] || '',
    MealPrice: row[5] || ''
  }));
}

async function deductMeal(rowNumber) {
  const normalizedRow = Number(rowNumber);
  if (!Number.isInteger(normalizedRow) || normalizedRow < 2) {
    throw new Error('rowNumber must be an integer >= 2');
  }

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

  const updatedValue = currentValue - 1;

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
      MealPrice
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

    const updatedMealsRemaining = await deductMeal(rowNumber);
    const priorMeals = Number(MealsRemaining) || 0;
    const newMealsRemaining = Number.isFinite(updatedMealsRemaining)
      ? updatedMealsRemaining
      : Math.max(priorMeals - 1, 0);
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
              <p style="margin: 0 0 8px; font-size: 14px; color: #334155;"><strong>Status:</strong> Delivered Today</p>
              <p style="margin: 0 0 8px; font-size: 14px; color: #334155;"><strong>Subscription Started:</strong> ${safeStartDate}</p>
              <p style="margin: 0; font-size: 14px; color: #334155;"><strong>Cost per Meal:</strong> ${safeMealPrice}</p>
            </div>
            <p style="margin: 0; font-size: 16px; font-weight: 700; color: #0f172a;">You have ${newMealsRemaining} out of ${safeTotalMeals} meals remaining.</p>
          </div>
        </div>
      </div>
    `;

    console.log(`[mark-delivered] Sending email to ${EmailAddress} for ${CustomerName}`);
    try {
      const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': process.env.BREVO_API_KEY,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          sender: { name: 'Cafe Salado', email: process.env.EMAIL_USER },
          to: [{ email: EmailAddress, name: CustomerName }],
          subject: '✅ Cafe Salado: Your Meal is Delivered!',
          htmlContent: htmlBody
        })
      });

      if (!brevoResponse.ok) {
        const errorText = await brevoResponse.text();
        throw new Error(`Brevo API error (${brevoResponse.status}): ${errorText}`);
      }

      const brevoData = await brevoResponse.json();
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
        MealPrice
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
