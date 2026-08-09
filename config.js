/* ================================================================
   CONFIG — All credentials and endpoints go here.
   Edit this file to change webhook URLs, Google Sheet ID, etc.
   ================================================================ */
const CONFIG = {
  // n8n Webhook URL for submitting new deals
  SUBMIT_WEBHOOK: 'https://n8n-scad.srv1492862.hstgr.cloud/webhook/19ee0d89-5430-444d-b1a7-a3493220a483',

  // Google Sheet ID (from your sheet URL)
  GOOGLE_SHEET_ID: '1hWXh-LBh15Dqn9SjqkZbbcZCOxJvGNqydlvhkqhSMLQ',

  // Sheet tabs (GIDs) — each tab has specific data
  SHEETS: {
    INPUT_DATA:        { gid: '1046894853', name: 'Input Data' },
    EXECUTIVE_SUMMARY: { gid: '1469855382', name: 'Executive Summary' },
    DEAL_ASSUMPTIONS:  { gid: '1215163735', name: 'Deal Assumptions' },
    RISK_RECOMMENDATION: { gid: '1959324970', name: 'Risk & Recommendation' },
  },

  // Build CSV URL for a specific sheet tab
  csvUrl(gid) {
    return `https://docs.google.com/spreadsheets/d/${this.GOOGLE_SHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}`;
  },

  // Company branding
  COMPANY_NAME: 'Meridian Capital',
  COMPANY_TAGLINE: 'Real Estate Underwriting',
};
