/**
 * CLIENT SATELLITE BACKEND - ELITE EDITION (SECURITY HARDENED)
 * Includes Wasapmatic OTP Flow, Duplicate Protection, and Registration Toggle.
 */

const SPREADSHEET = SpreadsheetApp.getActiveSpreadsheet();
const SHEETS = {
  SETTINGS: "Settings",
  MEMBERS: "Members",
  CLIENTS: "Clients",
  LICENSES: "Licenses",
  OTP: "OTP_Logs" // Hidden sheet for verification
};

// --- LINK TO MASTER HUB ---
const MASTER_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyp_U96hI95PQTmj6696rS-zPULBFPWJEh7e6B1knuOyJtepule22XXQFLQTKMCiwNA/exec";

function doGet(e) { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  let response;
  try {
    let params;
    try {
      params = (e.postData && e.postData.contents) ? JSON.parse(e.postData.contents) : e.parameter;
    } catch (err) { params = e.parameter; }

    const action = params.action;
    const payload = params.payload || params;
    const domain = payload.domain || "global";
 
    // 1. GLOBAL KILL-SWITCH (Ping Master)
    const bypassActions = ["activateLicense", "ping", "validateLicense", "updateProfile", "version", "getBranding", "login", "forgotPassword"];
    if (!bypassActions.includes(action)) {
      // Force domain verification. 
      const currentDomain = (payload.domain || "global").toLowerCase().trim();
      const access = callMasterHub("checkTenantAccess", { domain: currentDomain });
      if (access.status === "error") {
        return ContentService.createTextOutput(JSON.stringify(access)).setMimeType(ContentService.MimeType.JSON);
      }
    }

    switch (action) {
      case "version": response = { status: "success", version: "1.1.1-branding-fix" }; break;
      case "getBranding": response = getBranding(); break;
      case "ping": response = { status: "success", type: "satellite" }; break;
      case "login": response = login(payload); break;
      case "forgotPassword": response = forgotPassword(payload); break;
      case "getSettings": response = getSettings(); break;
      case "updateSettings": response = updateSettings(payload); break;
      case "listLicenses": response = listLicenses(); break;
      case "listClients": response = listClients(); break;
      case "sendOTP": response = sendOTP(payload); break;
      case "verifyOTP": response = verifyOTP(payload); break;
      case "generateLicense": response = generateLicense(payload); break;
      case "validateLicense": response = validateLicense(payload); break;
      case "testWebhook": response = testWebhook(payload); break;
      case "testWasapmatic": response = testWasapmatic(payload); break;
      case "activateLicense": response = activateLicense(payload); break;
      case "updateLicense": response = updateLicense(payload); break;
      case "updateClient": response = updateClient(payload); break;
      case "updateProfile": response = updateProfile(payload); break;
      case "resetSystem": response = resetSystem(payload); break;
      default: response = { status: "error", message: "Invalid Action: " + action };
    }
  } catch (err) { response = { status: "error", message: err.toString() }; }

  return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * SECURITY & REGISTRATION LOGIC
 */
function sendOTP(payload) {
  const settings = getSettings().data;
  if (settings.RegistrationDisabled === "true") return { status: "error", message: "Registration Disabled." };
  
  const phone = normalizePhone(payload.phone);
  const tag = (payload.tag || "direct").toLowerCase().trim();
  
  // 1. Phone Block List (Central Settings)
  const blockedPhones = String(settings.BlockedPhoneList || "").split(",").map(p => normalizePhone(p.trim())).filter(p => p);
  if (blockedPhones.includes(phone)) {
    return { status: "error", message: "This phone number has been blocked from registration." };
  }

  // 2. Tag Block List (Central Settings)
  const blockedTags = String(settings.BlockedTagList || "").split(",").map(t => t.trim().toLowerCase()).filter(t => t);
  if (blockedTags.includes(tag)) {
    return { status: "error", message: "Registration is not allowed for this source/tag." };
  }

  // 3. Check if phone is blocked or over limit in Clients Database
  const clientSheet = SPREADSHEET.getSheetByName(SHEETS.CLIENTS);
  if (clientSheet) {
    const clientData = clientSheet.getDataRange().getValues();
    for (let i = 1; i < clientData.length; i++) {
      if (normalizePhone(clientData[i][2]) === phone) {
        const status = String(clientData[i][6]).toLowerCase();
        if (status === "blocked" || status === "suspended") {
          return { status: "error", message: "Your access has been blocked. Please contact support." };
        }
        
        const maxGen = parseInt(clientData[i][7]) || parseInt(settings.DefaultMaxLicenses) || 3;
        const generated = parseInt(clientData[i][8]) || 0;
        if (generated >= maxGen) {
          return { status: "error", message: "License limit reached. Please contact support to upgrade." };
        }
        break;
      }
    }
  }

  const otp = Math.floor(100000 + Math.random() * 899999).toString(); // 6-digit
  const expiry = new Date(Date.now() + 5 * 60000); 
  
  const otpSheet = SPREADSHEET.getSheetByName(SHEETS.OTP) || SPREADSHEET.insertSheet(SHEETS.OTP);
  otpSheet.appendRow([phone, otp, expiry, "pending", new Date()]);
  
  return testWasapmatic({
    secret: settings.WasapmaticSecret,
    account: settings.WasapmaticAccountID,
    recipient: phone,
    message: "Verification Code: " + otp + "\nValid for 5 minutes."
  });
}

function verifyOTP(payload) {
  const phone = normalizePhone(payload.phone);
  const otpSheet = SPREADSHEET.getSheetByName(SHEETS.OTP);
  if (!otpSheet) return { status: "error", message: "No Records" };
  
  const data = otpSheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    // Force normalized comparison for phone and string for OTP
    if (normalizePhone(data[i][0]) === phone && data[i][3] === "pending") {
      const expiry = new Date(data[i][2]);
      if (expiry < new Date()) return { status: "error", message: "OTP Expired" };
      if (String(data[i][1]) === String(payload.otp)) {
        otpSheet.getRange(i + 1, 4).setValue("verified");
        SpreadsheetApp.flush(); // Ensure status is committed
        return { status: "success" };
      }
    }
  }
  return { status: "error", message: "Incorrect Code" };
}

function generateLicense(payload) {
  const settings = getSettings().data;
  if (settings.RegistrationDisabled === "true") return { status: "error", message: "Registration Disabled." };

  const phone = normalizePhone(payload.phone);
  
  // 1. Verify OTP Status (and find row to consume)
  const otpSheet = SPREADSHEET.getSheetByName(SHEETS.OTP);
  const otpData = otpSheet.getDataRange().getValues();
  let verifiedRow = -1;
  for (let i = otpData.length - 1; i >= 1; i--) {
    if (normalizePhone(otpData[i][0]) === phone && otpData[i][3] === "verified") {
      verifiedRow = i + 1;
      break;
    }
  }
  if (verifiedRow === -1) return { status: "error", message: "Phone number not verified. Please request OTP first." };
  
  // Consume the OTP so it can't be reused
  otpSheet.getRange(verifiedRow, 4).setValue("consumed");
  SpreadsheetApp.flush();

  // 2. Duplicate Check Removed: Multi-license allowed up to maxGen limit

  // 3. Geo-Restriction Check
  const meta = payload.metadata || {};
  const country = payload.country || meta.country || "Unknown";
  const mode = settings.GeoRestrictionMode || "none";
  const list = (settings.GeoRestrictionList || "").split(",").map(s => s.trim().toLowerCase());
  if (mode === "allow" && country !== "Unknown" && !list.includes(country.toLowerCase())) return { status: "error", message: "Service not available in " + country };
  if (mode === "block" && list.includes(country.toLowerCase())) return { status: "error", message: "Service restricted in " + country };

  // 4. Client & Limit Check
  const clientSheet = ensureSheetExists(SHEETS.CLIENTS);
  const licenseSheet = ensureSheetExists(SHEETS.LICENSES);
  const clientData = clientSheet.getDataRange().getValues();
  let clientRow = -1;
  let maxGen = parseInt(settings.DefaultMaxLicenses) || 3;
  let generatedCount = 0;

  for (let i = 1; i < clientData.length; i++) {
    if (normalizePhone(clientData[i][2]) === phone) {
      const status = String(clientData[i][6]).toLowerCase();
      if (status === "suspended" || status === "blocked") {
        return { status: "error", message: "Your account is " + status + ". Please contact support." };
      }
      clientRow = i + 1;
      maxGen = parseInt(clientData[i][7]) || maxGen;
      generatedCount = parseInt(clientData[i][8]) || 0;
      break;
    }
  }

  if (clientRow !== -1 && generatedCount >= maxGen) return { status: "error", message: "License limit reached." };

  // 5. Create Client & Generate Key
  if (clientRow === -1) {
    clientSheet.appendRow(["U-" + Date.now().toString().slice(-4), payload.name, phone, payload.email, new Date(), payload.tag || "direct", "active", maxGen, 1]);
  } else {
    clientSheet.getRange(clientRow, 9).setValue(generatedCount + 1);
  }
  
  // 6. Push Usage to Master Hub
  const masterLicenseKey = settings.MasterLicenseKey || "";
  if (masterLicenseKey) {
    callMasterHub("incrementUserCount", { licenseKey: masterLicenseKey });
  }

  const key = "L-" + Math.floor(1000+Math.random()*9000) + "-" + Math.floor(1000+Math.random()*9000);
  const val = parseInt(payload.durationVal || settings.DefaultDurationValue) || 1;
  const unit = payload.durationUnit || settings.DefaultDurationUnit || "years";
  let expiry = new Date();
  if (unit === "years") expiry.setFullYear(expiry.getFullYear() + val);
  else if (unit === "months") expiry.setMonth(expiry.getMonth() + val);
  else expiry.setDate(expiry.getDate() + val);

  const metadataJson = JSON.stringify(meta);
  licenseSheet.appendRow([key, payload.name, phone, payload.email, new Date(), "", "active", "Yes", maxGen, 0, expiry, val, unit, payload.tag || "direct", "", country, meta.region || "", metadataJson]);
  
  // 7. Trigger Webhook with Rich Data
  const webhookData = {
    licenseKey: key,
    name: payload.name,
    phone: phone,
    email: payload.email,
    expiryDate: expiry.toISOString(),
    tag: payload.tag || "direct",
    metadata: meta,
    location: {
      country: country,
      region: meta.region || "Unknown",
      city: meta.city || "Unknown"
    }
  };
  triggerSatelliteWebhook("license_generated", { event: "license_generated", data: webhookData });
  
  return { status: "success", key: key, expiry: expiry };
}

function updateLicense(p) {
  const s = SPREADSHEET.getSheetByName(SHEETS.LICENSES);
  const d = s.getDataRange().getValues();
  for (let i = 1; i < d.length; i++) {
    if (d[i][0] === p.licenseKey) {
      if (p.status) s.getRange(i + 1, 7).setValue(p.status);
      if (p.expiryDate !== undefined) s.getRange(i + 1, 11).setValue(p.expiryDate === "" ? "" : new Date(p.expiryDate));
      return { status: "success" };
    }
  }
  return { status: "error" };
}

function updateClient(p) {
  const s = SPREADSHEET.getSheetByName(SHEETS.CLIENTS);
  const d = s.getDataRange().getValues();
  const phone = normalizePhone(p.phone);
  for (let i = 1; i < d.length; i++) {
    if (normalizePhone(d[i][2]) === phone) {
      if (p.status) s.getRange(i + 1, 7).setValue(p.status);
      if (p.maxLicenses !== undefined) s.getRange(i + 1, 8).setValue(p.maxLicenses);
      return { status: "success" };
    }
  }
  return { status: "error", message: "Client not found" };
}
function resetSystem(p) {
  if (p.type === 'licenses') {
    const s = ensureSheetExists(SHEETS.LICENSES);
    s.clear();
    s.appendRow(["License Key", "Name", "Phone", "Email", "Created At", "Activate At", "Status", "Mail Sent", "Max Gen", "Generated", "Expiry Date", "Val", "Unit", "Tag", "Domain", "Country", "Region", "Metadata"]);
    const styleRange = s.getRange(1, 1, 1, 18);
    styleRange.setBackground("#6366f1").setFontColor("#ffffff").setFontWeight("bold").setHorizontalAlignment("center");
    s.setFrozenRows(1);
    
    // Also reset license counts in Clients
    const cs = ensureSheetExists(SHEETS.CLIENTS);
    if (cs.getLastRow() > 1) {
       cs.getRange(2, 9, cs.getLastRow()-1, 1).setValue(0);
    }
    return { status: "success", message: "License ledger has been reset safely." };
  }
  return { status: "error", message: "Invalid reset type" };
}

function ensureSheetExists(name) {
  let s = SPREADSHEET.getSheetByName(name);
  if (!s) {
    s = SPREADSHEET.insertSheet(name);
    // Initialize headers if it's a core sheet
    if (name === SHEETS.LICENSES) {
       s.appendRow(["License Key", "Name", "Phone", "Email", "Created At", "Activate At", "Status", "Mail Sent", "Max Gen", "Generated", "Expiry Date", "Val", "Unit", "Tag", "Domain", "Country", "Region", "Metadata"]);
       const styleRange = s.getRange(1, 1, 1, 18);
       styleRange.setBackground("#6366f1").setFontColor("#ffffff").setFontWeight("bold").setHorizontalAlignment("center");
       s.setFrozenRows(1);
    } else if (name === SHEETS.CLIENTS) {
       s.appendRow(["ID", "Name", "Phone", "Email", "CreatedAt", "Tag", "Status", "MaxLicenses", "LicensesGenerated"]);
       const styleRange = s.getRange(1, 1, 1, 9);
       styleRange.setBackground("#0f172a").setFontColor("#ffffff").setFontWeight("bold").setHorizontalAlignment("center");
       s.setFrozenRows(1);
    }
  }
  return s;
}

function updateSettings(payload) {
  const sheet = SPREADSHEET.getSheetByName(SHEETS.SETTINGS);
  const data = sheet.getDataRange().getValues();
  const settingsToUpdate = payload.settings || payload;

  for (const [key, rawValue] of Object.entries(settingsToUpdate)) {
    let found = false;
    const cleanKey = key.replace(":", "");
    const value = (typeof rawValue === 'object') ? JSON.stringify(rawValue) : rawValue;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].replace(":", "").trim().toLowerCase() === cleanKey.toLowerCase()) {
        sheet.getRange(i + 1, 2).setValue(value);
        found = true;
      }
    }
    if (!found && !["userId", "domain", "apiKey", "masterKey"].includes(cleanKey)) {
      sheet.appendRow([cleanKey + ":", value, "global"]);
    }
  }
  SpreadsheetApp.flush();
  return { status: "success", message: "Settings Synchronized" };
}

/**
 * SYSTEM BOOTSTRAP
 */
function activateLicense(payload) {
  const res = callMasterHub("activateLicense", payload);
  if (res.status === "error") return res;
  
  // Check if already initialized to avoid wiping data
  const memberSheet = SPREADSHEET.getSheetByName(SHEETS.MEMBERS);
  const alreadyInitialized = memberSheet && memberSheet.getLastRow() > 1;
  
  if (!alreadyInitialized) {
    bootstrapSatellite(payload.email, payload.password, payload.licenseKey);
    return { status: "success", message: "System Activated & Initialized." };
  }
  
  return { status: "success", message: "System Activation Verified. Existing data preserved." };
}

function bootstrapSatellite(email, password, licenseKey) {
  const headerStyle = (sheet, color) => {
    const range = sheet.getRange(1, 1, 1, sheet.getLastColumn());
    range.setBackground(color).setFontColor("#ffffff").setFontWeight("bold").setHorizontalAlignment("center");
    sheet.setFrozenRows(1);
  };
  Object.values(SHEETS).forEach(n => { if (!SPREADSHEET.getSheetByName(n)) SPREADSHEET.insertSheet(n); });
  
  const m = SPREADSHEET.getSheetByName(SHEETS.MEMBERS);
  m.clear().appendRow(["ID", "Name", "Email", "Password", "Role", "Status", "Archived", "CreatedAt"]);
  m.appendRow(["U-001", "Administrator", email, hashPassword(password), "admin", "active", false, new Date()]);
  headerStyle(m, "#1e293b");

  const c = SPREADSHEET.getSheetByName(SHEETS.CLIENTS);
  c.clear().appendRow(["ID", "Name", "Phone", "Email", "CreatedAt", "Tag", "Status", "MaxLicenses", "LicensesGenerated"]);
  headerStyle(c, "#0f172a");

  const l = SPREADSHEET.getSheetByName(SHEETS.LICENSES);
  l.clear().appendRow(["License Key", "Name", "Phone", "Email", "Created At", "Activate At", "Status", "Mail Sent", "Max Gen", "Generated", "Expiry Date", "Val", "Unit", "Tag", "Domain", "Country", "Region", "Metadata"]);
  headerStyle(l, "#6366f1");

  const s = SPREADSHEET.getSheetByName(SHEETS.SETTINGS);
  s.clear().appendRow(["Parameter", "Value", "Scope"]);
  const defaultSettings = [
    ["SystemName:", "License Portal", "global"],
    ["DefaultMaxLicenses:", 3, "global"],
    ["DefaultDurationValue:", 1, "global"],
    ["DefaultDurationUnit:", "years", "global"],
    ["GeoRestrictionMode:", "none", "global"],
    ["GeoRestrictionList:", "", "global"],
    ["N8NWebhookURL:", "", "global"],
    ["WasapmaticSecret:", "", "global"],
    ["WasapmaticAccountID:", "", "global"],
    ["RegistrationDisabled:", "false", "global"],
    ["BlockedPhoneList:", "", "global"],
    ["BlockedTagList:", "", "global"]
  ];
  s.getRange(2, 1, defaultSettings.length, 3).setValues(defaultSettings);
  s.getRange("B:B").setNumberFormat("@"); // Force Plain Text for the Value column
  headerStyle(s, "#334155");
}

/**
 * INTEGRATIONS
 */
function testWebhook(p) {
  const meta = p.metadata || {};
  const payload = {
    event: p.event || "test_ping",
    data: {
      licenseKey: "TEST-" + Math.random().toString(36).substr(2,4).toUpperCase() + "-" + Math.random().toString(36).substr(2,4).toUpperCase(),
      name:       "Test User",
      phone:      p.phone || "60123456789",
      email:      p.email || "test@example.com",
      createdAt:  new Date().toISOString(),
      expiryDate: new Date(Date.now() + 31536000000).toISOString(),
      tag:        p.tag || "Testing",
      location: {
        country: meta.country || "Unknown",
        region:  meta.region  || "Unknown",
        city:    meta.city    || "Unknown"
      },
      metadata: {
        ip:      meta.ip      || "Unknown",
        os:      meta.os      || "Unknown",
        browser: meta.browser || "Unknown"
      }
    }
  };
  triggerSatelliteWebhook(payload.event, payload);
  return { status: "success", payload: payload };
}

function triggerSatelliteWebhook(event, fullPayload) {
  const s = getSettings().data;
  const url = s.N8NWebhookURL;
  if (!url) return;
  try { UrlFetchApp.fetch(url, { method: "post", contentType: "application/json", payload: JSON.stringify(fullPayload) }); } catch(e) {}
}

function testWasapmatic(p) {
  const url = "https://app.wasapmatic.com/api/send/whatsapp";
  try {
    const res = UrlFetchApp.fetch(url, { method: "post", payload: { secret: p.secret, account: p.account, recipient: normalizePhone(p.recipient), type: "text", message: p.message || "License Hub Connectivity Test Successful!" } });
    return { status: "success", data: JSON.parse(res.getContentText()) };
  } catch (e) { return { status: "error", message: e.toString() }; }
}

/**
 * UTILS
 */
function callMasterHub(action, payload) {
  try { const res = UrlFetchApp.fetch(MASTER_SCRIPT_URL, { method: "post", contentType: "application/json", payload: JSON.stringify({ action, payload }) }); return JSON.parse(res.getContentText()); } catch (e) { return { status: "error", message: "Master Offline" }; }
}

function getBranding() {
  const s = getSettings().data;
  return { status: "success", data: { name: s.SystemName || "License Generator", color: s.PrimaryColor || "#2563eb" } };
}

function getSettings() {
  const s = SPREADSHEET.getSheetByName(SHEETS.SETTINGS);
  if (!s) return { status: "error", message: "Settings sheet missing" };
  const d = s.getDataRange().getValues();
  let o = {}; 
  d.forEach(r => { 
    if (r[0]) {
      const key = String(r[0]).replace(':', '').trim();
      o[key] = r[1]; 
    }
  });
  return { status: "success", data: o };
}

function listLicenses() {
  const s = SPREADSHEET.getSheetByName(SHEETS.LICENSES);
  if (!s) return { status: "success", data: [] };
  const d = s.getDataRange().getValues();
  const h = d.shift();
  return { 
    status: "success", 
    data: d.map(r => { 
      let o = {}; 
      h.forEach((k, i) => {
        const key = k.toLowerCase().replace(/\s/g, '');
        let val = r[i];
        if (key === "metadata" && val && String(val).startsWith("{")) {
          try { val = JSON.parse(val); } catch(e) {}
        }
        o[key] = val;
      }); 
      return o; 
    }).reverse() 
  };
}

function listClients() {
  const d = SPREADSHEET.getSheetByName(SHEETS.CLIENTS).getDataRange().getValues();
  const h = d.shift();
  return { status: "success", data: d.map(r => { let o = {}; h.forEach((k, i) => o[k.toLowerCase().replace(/\s/g, '')] = r[i]); return o; }).reverse() };
}

function updateProfile(p) {
  const sheet = SPREADSHEET.getSheetByName(SHEETS.MEMBERS);
  const data = sheet.getDataRange().getValues();
  const id = p.id;
  const lookupEmail = p.currentEmail; // Pass the current email as fallback
  
  if (!id && !lookupEmail) return { status: "error", message: "Missing User Identity (ID or Email)" };

  const newEmail = p.email || p.newEmail;
  const newPassword = p.password || p.newPassword;

  for (let i = 1; i < data.length; i++) {
    // Match by ID OR by Current Email
    if ((id && data[i][0] === id) || (lookupEmail && data[i][2] === lookupEmail)) {
      if (p.name) sheet.getRange(i + 1, 2).setValue(p.name);
      if (newEmail) sheet.getRange(i + 1, 3).setValue(newEmail);
      if (newPassword) sheet.getRange(i + 1, 4).setValue(hashPassword(newPassword));
      return { status: "success" };
    }
  }
  return { status: "error", message: "Member not found" };
}

function forgotPassword(p) {
  const email = p.email;
  if (!email) return { status: "error", message: "Email is required." };
  
  const sheet = SPREADSHEET.getSheetByName(SHEETS.MEMBERS);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][2] === email) {
      const newPassword = Math.random().toString(36).slice(-8);
      sheet.getRange(i + 1, 4).setValue(hashPassword(newPassword));
      
      try {
        const subject = "Password Reset - License System";
        const body = "Hello " + data[i][1] + ",\n\nYour new temporary password is: " + newPassword + "\n\nPlease login and change it immediately.";
        MailApp.sendEmail(email, subject, body);
        return { status: "success" };
      } catch (err) {
        return { status: "error", message: "Failed to send email. Ensure you have granted email permissions." };
      }
    }
  }
  return { status: "error", message: "Email not found." };
}

function login(p) {
  const d = SPREADSHEET.getSheetByName(SHEETS.MEMBERS).getDataRange().getValues();
  for (let i = 1; i < d.length; i++) { if (d[i][2] === p.email && (d[i][3] === hashPassword(p.password) || d[i][3] === p.password)) { return { status: "success", data: { id: d[i][0], name: d[i][1], email: d[i][2] } }; } }
  return { status: "error" };
}

function validateLicense(p) {
  const settings = getSettings().data;
  const apiKey = p.apiKey || "";
  
  if (!settings.APISecret || apiKey !== settings.APISecret) {
    return { status: "error", message: "Invalid API Key" };
  }

  const licenseKey = p.licenseKey || "";
  if (!licenseKey) return { status: "error", message: "Missing License Key" };

  const s = SPREADSHEET.getSheetByName(SHEETS.LICENSES);
  const data = s.getDataRange().getValues();
  const headers = data[0];

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === licenseKey) {
      const status = String(data[i][6]).toLowerCase();
      const expiryDate = data[i][10];
      const isExpired = expiryDate && new Date(expiryDate) < new Date();
      
      const response = {
        status: "success",
        valid: status === "active" && !isExpired,
        message: status !== "active" ? "License " + status : (isExpired ? "License Expired" : "License Active"),
        data: {
          licenseKey: data[i][0],
          name: data[i][1],
          phone: data[i][2],
          email: data[i][3],
          createdAt: data[i][4],
          status: data[i][6],
          expiryDate: expiryDate || "Lifetime",
          tag: data[i][13] || "direct"
        }
      };
      return response;
    }
  }
  return { status: "error", message: "License not found" };
}

function activateLicense(p) {
  // 1. Delegate to Master Hub
  const res = callMasterHub("activateLicense", {
    licenseKey: p.licenseKey,
    email: p.email,
    webUrl: p.webUrl,
    domain: p.domain || "global"
  });

  if (res.status === "success") {
    // 2. Initialize Satellite Database (Members & Settings)
    const membersSheet = SPREADSHEET.getSheetByName(SHEETS.MEMBERS);
    if (membersSheet) {
      const data = membersSheet.getDataRange().getValues();
      let found = false;
      for (let i = 1; i < data.length; i++) {
        if (data[i][2] === p.email) {
          membersSheet.getRange(i + 1, 4).setValue(hashPassword(p.password));
          found = true;
          break;
        }
      }
      if (!found) {
        membersSheet.appendRow(["M-" + Date.now(), "Admin", p.email, hashPassword(p.password), "admin", "active", false, new Date()]);
      }
    }
    
    // 3. Set basic settings if missing
    const settingsSheet = SPREADSHEET.getSheetByName(SHEETS.SETTINGS);
    if (settingsSheet) {
      const sData = getSettings().data;
      if (!sData.SystemName) settingsSheet.appendRow(["SystemName", "License Generator"]);
      if (!sData.PrimaryColor) settingsSheet.appendRow(["PrimaryColor", "#2563eb"]);
    }
  }

  return res;
}

function hashPassword(p) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, p).map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join(''); }
function normalizePhone(p) { return String(p).replace(/\s|-|\+/g, '').replace(/^0/, '60'); }
