const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');
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

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_APP_PASSWORD
    }
  });
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
    range: `${SHEET_NAME}!A2:D`
  });

  const rows = response.data.values || [];

  return rows.map((row, index) => ({
    rowNumber: index + 2,
    CustomerName: row[0] || '',
    EmailAddress: row[1] || '',
    TotalMeals: Number(row[2] || 0),
    MealsRemaining: Number(row[3] || 0)
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
    const { rowNumber, CustomerName, EmailAddress, MealsRemaining } = req.body;

    if (!rowNumber || !CustomerName || !EmailAddress) {
      return res.status(400).json({
        success: false,
        message: 'rowNumber, CustomerName, and EmailAddress are required'
      });
    }

    const updatedMealsRemaining = await deductMeal(rowNumber);
    const priorMeals = Number(MealsRemaining) || 0;
    const newMealsRemaining = Number.isFinite(updatedMealsRemaining)
      ? updatedMealsRemaining
      : Math.max(priorMeals - 1, 0);

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; background: #f6f8fb; padding: 24px;">
        <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e5e7eb;">
          <div style="background: #0f172a; color: #ffffff; padding: 20px 24px;">
            <h2 style="margin: 0; font-size: 22px;">Cafe Salado Delivery Update</h2>
          </div>
          <div style="padding: 24px; color: #111827; line-height: 1.6;">
            <p style="margin: 0 0 12px;">Hello ${CustomerName},</p>
            <p style="margin: 0 0 12px;">your meal for today has been delivered to you in Nelamangala!</p>
            <p style="margin: 0;"><strong>You have ${newMealsRemaining} meals left in your subscription.</strong></p>
          </div>
        </div>
      </div>
    `;

    console.log(`[mark-delivered] Sending email to ${EmailAddress} for ${CustomerName}`);
    const mailResult = await transporter.sendMail({
      from: EMAIL_USER,
      to: EmailAddress,
      subject: 'Your Cafe Salado Meal Delivery',
      html: htmlBody
    });
    console.log(`[mark-delivered] Email sent successfully: ${mailResult.messageId}`);

    return res.json({
      success: true,
      message: 'Meal marked as delivered and email notification sent',
      data: {
        rowNumber,
        CustomerName,
        EmailAddress,
        MealsRemaining: newMealsRemaining
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
