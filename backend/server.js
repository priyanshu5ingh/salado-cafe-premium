const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');
const { google } = require('googleapis');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'Sheet1';
const SHEET_ID = process.env.GOOGLE_SHEET_ID || process.env.SPREADSHEET_ID;
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;
const SMS_GATEWAY_URL = process.env.SMS_GATEWAY_URL;

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
    range: `${SHEET_NAME}!A2:D`
  });

  const rows = response.data.values || [];

  return rows.map((row, index) => ({
    rowNumber: index + 2,
    CustomerName: row[0] || '',
    PhoneNumber: row[1] || '',
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
    const { rowNumber, CustomerName, PhoneNumber, MealsRemaining } = req.body;

    if (!rowNumber || !CustomerName || !PhoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'rowNumber, CustomerName, and PhoneNumber are required'
      });
    }

    const updatedMealsRemaining = await deductMeal(rowNumber);

    if (!SMS_GATEWAY_URL) {
      throw new Error('SMS_GATEWAY_URL is not configured');
    }

    const priorMeals = Number(MealsRemaining);
    const fallbackMeals = Number.isFinite(priorMeals) && priorMeals > 0
      ? priorMeals - 1
      : updatedMealsRemaining;

    const message = `Hi ${CustomerName}, your meal for today has been delivered. Meals remaining: ${updatedMealsRemaining ?? fallbackMeals}.`;

    await axios.post(SMS_GATEWAY_URL, {
      to: PhoneNumber,
      message
    });

    return res.json({
      success: true,
      message: 'Meal marked as delivered and SMS notification sent',
      data: {
        rowNumber,
        CustomerName,
        PhoneNumber,
        MealsRemaining: updatedMealsRemaining
      }
    });
  } catch (error) {
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
