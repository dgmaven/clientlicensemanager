// js/utils.js

const Utils = {
  /**
   * Format currency
   * @param {number} amount 
   * @returns {string} Formatted currency string
   */
  formatCurrency(amount) {
    if (isNaN(amount)) return `${CONFIG.CURRENCY} 0.00`;
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency: CONFIG.CURRENCY,
      minimumFractionDigits: 2
    }).format(amount).replace(CONFIG.CURRENCY, CONFIG.CURRENCY + ' ');
  },

  async autoDiscoverSatellite() {
    const domain = window.location.hostname;
    try {
      const response = await this.callApi("getSatelliteConfig", { domain }, CONFIG.MASTER_HUB_URL);
      if (response.status === 'success' && response.webUrl) {
        localStorage.setItem('SYSTEM_WEB_URL', response.webUrl);
        return true;
      }
    } catch (e) {
      console.warn("Auto-discovery failed", e);
    }
    return false;
  },

  /**
   * Format date as DD/MM/YY
   * @param {string|Date} dateStr 
   * @returns {string} Formatted date string
   */
  formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
  },

  /**
   * Format time as HH:MM
   * @param {string|Date} dateStr 
   * @returns {string} Formatted time string
   */
  formatTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  },

  /**
   * Normalize Phone Number for Wasapmatic based on SOP
   * @param {string} phone 
   * @returns {string} Normalized phone number
   */
  normalizePhone(phone) {
    if (!phone) return '';
    
    // 1. Remove spaces and dashes
    phone = phone.replace(/\s|-/g, '');
    
    // 2. Remove '+' if exists
    phone = phone.replace(/^\+/, '');

    // 3. If starts with '0' -> replace with '60'
    if (phone.startsWith('0')) {
      phone = '60' + phone.substring(1);
    }

    return phone;
  },

  /**
   * Get Browser Metadata for Webhooks & Analytics
   */
  async getBrowserMetadata() {
    try {
      // 1. Try GeoJS (Primary - Free, no auth)
      let geoRes = await fetch('https://get.geojs.io/v1/ip/geo.json').catch(() => null);
      let geoData = geoRes ? await geoRes.json() : null;

      // 2. Fallback to ipapi.co if GeoJS fails
      if (!geoData || !geoData.ip) {
        geoRes = await fetch('https://ipapi.co/json/').catch(() => null);
        geoData = geoRes ? await geoRes.json() : {};
      }

      const ua = navigator.userAgent;
      let browser = "Unknown";
      let os = "Unknown";

      // Improved OS detection for iOS/Android
      if (/Android/i.test(ua)) os = "Android";
      else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
      else if (/Windows/i.test(ua)) os = "Windows";
      else if (/Mac/i.test(ua)) os = "MacOS";
      else if (/Linux/i.test(ua)) os = "Linux";

      // Improved Browser detection
      if (/Firefox/i.test(ua)) browser = "Firefox";
      else if (/SamsungBrowser/i.test(ua)) browser = "Samsung Browser";
      else if (/Chrome/i.test(ua)) browser = "Chrome";
      else if (/Safari/i.test(ua)) browser = "Safari";

      return {
        ip: geoData.ip || 'unknown',
        city: geoData.city || '',
        region: geoData.region || geoData.region_name || '',
        country: geoData.country || geoData.country_name || '',
        os: os,
        browser: browser,
        userAgent: ua
      };
    } catch (e) {
      return { ip: 'unknown', city: '', region: '', country: '', os: 'unknown', browser: 'unknown', userAgent: navigator.userAgent };
    }
  },

  /**
   * Generic API caller
   * @param {string} action Action name matching Apps Script
   * @param {object} payload Data to send
   * @returns {Promise<object>} JSON response
   */
  async callApi(action, payload = {}, customUrl = null) {
    const targetUrl = (customUrl || CONFIG.WEB_URL || "").trim();
    
    if (!targetUrl || !targetUrl.startsWith("http")) {
      throw new Error("Invalid or missing WEB URL. Please check your system configuration.");
    }

    if (CONFIG.ENV === "DEBUG") {
      console.log(`[API CALL] Action: ${action}`, { url: targetUrl, payload });
    }

    // MASTER GOD-MODE INJECTION
    const user = JSON.parse(localStorage.getItem('license_system_user') || '{}');
    const enrichedPayload = {
      ...payload,
      domain: payload.domain || window.location.hostname,
      userId: user.id || null,
      masterKey: "AGENCY-GOD-MODE-2024", // The bypass key
      _t: Date.now() // Cache buster
    };

    try {
      // Use text/plain to avoid CORS preflight issues with GAS
      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
        },
        body: JSON.stringify({ action, payload: enrichedPayload }),
      });

      const text = await response.text();
      try {
        const json = JSON.parse(text);
        
        // AUTO-REDIRECT ON UNREGISTERED DOMAIN
        const ignorePages = ["activation.html", "login.html", "setup.html"];
        const isIgnored = ignorePages.some(p => window.location.pathname.includes(p));
        
        if (json.status === "error" && !isIgnored && (json.message.includes("Unregistered Domain") || json.message.includes("Domain BLOCKED"))) {
            console.error("CRITICAL: Domain not authorized:", json.message);
            // Only redirect if it's a clean "Unregistered Domain" or "Domain BLOCKED"
            // If it has details in brackets, let the UI show it first for debugging
            if (json.message === "Unregistered Domain" || json.message === "Domain BLOCKED") {
                window.location.href = "activation.html?reason=" + encodeURIComponent(json.message);
            } else {
                alert("Access Denied: " + json.message);
            }
            return json;
        }

        return json;
      } catch (e) {
        // If it's not JSON, it might be an HTML error page or successful text
        return { status: "success", raw: text };
      }
    } catch (error) {
      console.error("API Call Error:", error);
      if (window.location.pathname.indexOf("setup.html") === -1 && (error.name === "TypeError" || error.message.includes("Failed to fetch"))) {
         // We no longer auto-redirect here for the Master to avoid loops.
         // Let the UI handle the connection error.
      }
      return { status: "error", message: error.message };
    }
  }
};
