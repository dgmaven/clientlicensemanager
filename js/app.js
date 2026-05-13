// client/js/app.js - FINAL MASTER SYNC
const { createApp, ref, computed, onMounted } = Vue;

const app = createApp({
  setup() {
    if (!Auth.isAuthenticated()) {
      window.location.href = "login.html";
      return;
    }

    const formatCurrency = Utils.formatCurrency;
    const formatDate = Utils.formatDate;

    // State
    const user = ref(Auth.getUser());
    const currentTab = ref('dashboard');
    const sidebarOpen = ref(false);
    const showAuthModal = ref(false);
    const configUrl = ref(CONFIG.WEB_URL);
    
    // Data Lists
    const testingWebhook = ref(false);
    const clientsList = ref([]);
    const licensesList = ref([]);
    const changelog = ref([]);
    
    // System Auth Health
    const systemError = ref(false);
    const gasEditorUrl = ref(CONFIG.GAS_EDITOR_URL);
    
    // UI Loaders
    const loading = ref({
        clients: false,
        licenses: false,
        settings: false,
        wasap: false,
        email: false,
        general: false,
        api: false,
        github: false,
        update: false
    });

    // Modals
    const modals = ref({
        profile: false,
        addClient: false,
        clientDetails: false,
        quickCreate: false
    });

    // Forms
    const profileForm = ref({ id: '', name: '', email: '', password: '', currentEmail: '' });
    const addClientForm = ref({ name: '', phone: '', email: '', source: '' });
    const genLicenseForm = ref({ val: 1, unit: 'years', maxGen: 3 });
    const quickCreateForm = ref({ client: null, val: 1, unit: 'years', maxGen: 3 });

    const systemConfig = ref({
        webUrl: CONFIG.WEB_URL,
        gasEditorUrl: CONFIG.GAS_EDITOR_URL,
        githubOwner: CONFIG.GITHUB_OWNER,
        githubRepo: CONFIG.GITHUB_REPO
    });

    const settingsData = ref({
        MemberPrefix: 'M',
        MemberRunningID: 1,
        DefaultMaxLicenses: 3,
        DefaultDurationValue: 1,
        DefaultDurationUnit: 'years',
        WasapmaticSecret: '',
        WasapmaticAccountID: '',
        N8NWebhookURL: '',
        GithubPAT: '',
        GeoRestrictionMode: 'none',
        GeoRestrictionList: '',
        BlockedPhoneList: '',
        BlockedTagList: ''
    });
    
    const wasapTestPhone = ref('');
    const wasapResult = ref('');
    const emailTestAddress = ref('');
    const webhookTestEvent = ref('license_generated');
    const webhookTestTag = ref('');
    const webhookTestEmail = ref('');
    const webhookTestRegion = ref('');
    const webhookTestCountry = ref('');
    const webhookTestPhone = ref('');
    const webhookTestOS = ref('');
    const webhookTestBrowser = ref('');

    // Client Details & Filtering
    const selectedClient = ref(null);
    const clientFilters = ref({
        query: '',
        tag: '',
        location: '',
        status: '',
        dateStart: '',
        dateEnd: ''
    });

    // Computed
    const filteredClients = computed(() => {
        let filtered = clientsList.value;
        filtered = filtered.map(c => {
            c.licenses = licensesList.value.filter(l => l.phone === c.phone);
            return c;
        });
        if (clientFilters.value.query) {
            const q = clientFilters.value.query.toLowerCase();
            filtered = filtered.filter(c => {
                const name = String(c.name || '').toLowerCase();
                const email = String(c.email || '').toLowerCase();
                const phone = String(c.phone || '');
                return name.includes(q) || email.includes(q) || phone.includes(q);
            });
        }
        if (clientFilters.value.status) filtered = filtered.filter(c => c.status === clientFilters.value.status);
        if (clientFilters.value.tag) {
            const t = clientFilters.value.tag.toLowerCase();
            filtered = filtered.filter(c => c.licenses.some(l => String(l.tag || '').toLowerCase().includes(t)));
        }
        if (clientFilters.value.location) {
            const loc = clientFilters.value.location.toLowerCase();
            filtered = filtered.filter(c => c.licenses.some(l => String(l.location || '').toLowerCase().includes(loc)));
        }
        if (clientFilters.value.dateStart) {
            const start = new Date(clientFilters.value.dateStart).getTime();
            filtered = filtered.filter(c => new Date(c.createdat).getTime() >= start);
        }
        if (clientFilters.value.dateEnd) {
            const end = new Date(clientFilters.value.dateEnd).setHours(23, 59, 59, 999);
            filtered = filtered.filter(c => new Date(c.createdat).getTime() <= end);
        }
        return filtered;
    });

    const analytics = computed(() => {
        let filteredLicenses = licensesList.value;
        
        // Apply Filters to Analytics
        if (clientFilters.value.tag) {
            const t = clientFilters.value.tag.toLowerCase();
            filteredLicenses = filteredLicenses.filter(l => String(l.tag || '').toLowerCase().includes(t));
        }
        if (clientFilters.value.location) {
            const loc = clientFilters.value.location.toLowerCase();
            filteredLicenses = filteredLicenses.filter(l => String(l.location || '').toLowerCase().includes(loc) || String(l.country || '').toLowerCase().includes(loc));
        }
        if (clientFilters.value.dateStart) {
            const start = new Date(clientFilters.value.dateStart).getTime();
            filteredLicenses = filteredLicenses.filter(l => new Date(l.createdat).getTime() >= start);
        }
        if (clientFilters.value.dateEnd) {
            const end = new Date(clientFilters.value.dateEnd).setHours(23, 59, 59, 999);
            filteredLicenses = filteredLicenses.filter(l => new Date(l.createdat).getTime() <= end);
        }

        const stats = {
            totalClients: filteredLicenses.length,
            activeLicenses: filteredLicenses.filter(l => l.status === 'active').length,
            blockedClients: filteredLicenses.filter(l => l.status === 'blocked').length,
            countries: {},
            os: {},
            browsers: {},
            sources: {},
            emailDomains: { gmail: 0, yahoo: 0, outlook: 0, other: 0 },
            timeBlocks: { morning: 0, afternoon: 0, evening: 0, night: 0 }
        };

        filteredLicenses.forEach(l => {
            const country = l.country || 'Unknown';
            stats.countries[country] = (stats.countries[country] || 0) + 1;
            
            const source = l.tag || 'Direct';
            stats.sources[source] = (stats.sources[source] || 0) + 1;

            const os = l.metadata?.os || 'Unknown';
            const browser = l.metadata?.browser || 'Unknown';
            stats.os[os] = (stats.os[os] || 0) + 1;
            stats.browsers[browser] = (stats.browsers[browser] || 0) + 1;

            const email = (l.email || '').toLowerCase();
            if (email.includes('gmail.com')) stats.emailDomains.gmail++;
            else if (email.includes('yahoo')) stats.emailDomains.yahoo++;
            else if (email.includes('outlook') || email.includes('hotmail')) stats.emailDomains.outlook++;
            else stats.emailDomains.other++;

            if (l.createdat) {
                const hour = new Date(l.createdat).getHours();
                if (hour >= 5 && hour < 12) stats.timeBlocks.morning++;
                else if (hour >= 12 && hour < 17) stats.timeBlocks.afternoon++;
                else if (hour >= 17 && hour < 21) stats.timeBlocks.evening++;
                else stats.timeBlocks.night++;
            }
        });
        return stats;
    });

    const pageTitle = computed(() => {
      const titles = { dashboard: 'Dashboard Overview', clients: 'Clients Management', licenses: 'Licenses Ledger', blocklist: 'Blocklist Management', members: 'System Admins', settings: 'Settings & Resets', api: 'API & Integration', reports: 'Reports & Analytics' };
      return titles[currentTab.value] || 'System';
    });

    // Navigation
    const switchTab = (tab) => {
        currentTab.value = tab;
        sidebarOpen.value = false;
        if(tab === 'clients') loadClients();
        if(tab === 'licenses') loadLicenses();
        if(tab === 'settings' || tab === 'api' || tab === 'blocklist') loadSettings();
        if(tab === 'reports') { loadClients(); loadLicenses(); }
    };

    const handleLogout = () => Auth.logout();

    // Profile Management
    const openProfileModal = () => { 
        const u = Auth.getUser();
        if (!u.id) console.warn("User ID is missing from local storage. Fallback to Email lookup enabled.");
        profileForm.value = { 
            id: u.id || '', 
            name: u.name || '', 
            email: '', // Reset new email field
            currentEmail: u.email || '', 
            password: '' 
        };
        modals.value.profile = true; 
    };
    const saveProfile = async () => {
        loading.value.general = true;
        const res = await Utils.callApi("updateProfile", profileForm.value);
        loading.value.general = false;
        if (res.status === 'success') {
            alert("Profile updated successfully! Logging out to apply changes...");
            handleLogout();
        } else {
            alert("Error: " + (res.message || "Failed to update profile"));
        }
    };

    // Client Management
    const openClientModal = (client) => { selectedClient.value = client; modals.value.clientDetails = true; };
    const openAddClient = () => { modals.value.addClient = true; };
    const openQuickCreate = () => { modals.value.quickCreate = true; };

    const submitAddClient = async () => {
      loading.value.general = true;
      const response = await Utils.callApi("createClient", addClientForm.value);
      loading.value.general = false;
      if (response.status === "success") { modals.value.addClient = false; loadClients(); }
    };

    const generateLicenseForClient = async () => {
        if (!selectedClient.value) return;
        loading.value.general = true;
        const response = await Utils.callApi("generateLicense", { phone: selectedClient.value.phone, durationVal: genLicenseForm.value.val, durationUnit: genLicenseForm.value.unit });
        loading.value.general = false;
        if (response.status === "success") { alert("Success!"); loadClients(); }
    };

    const testWebhook = async () => {
        loading.value.api = true;
        const res = await Utils.callApi("testWebhook", { event: webhookTestEvent.value, tag: webhookTestTag.value, email: webhookTestEmail.value });
        loading.value.api = false;
        alert(res.status === "success" ? "Webhook Sent!" : "Failed: " + res.message);
    };

    // APIs: Clients & Licenses
    const loadClients = async () => {
      loading.value.clients = true;
      const res = await Utils.callApi("listClients");
      if(res.status === 'success') clientsList.value = res.data.reverse();
      loading.value.clients = false;
    };

    const loadLicenses = async () => {
      loading.value.licenses = true;
      const res = await Utils.callApi("listLicenses");
      if(res.status === 'success') licensesList.value = res.data.reverse();
      loading.value.licenses = false;
    };

    const loadSettings = async () => {
       const res = await Utils.callApi("getSettings");
       if (res.status === 'success') Object.assign(settingsData.value, res.data);
    };

    const saveSettings = async () => {
        loading.value.settings = true;
        await Utils.callApi("updateSettings", { settings: settingsData.value });
        loading.value.settings = false;
        alert('Settings saved!');
    };

    const saveSystemConfig = () => {
        CONFIG.WEB_URL = systemConfig.value.webUrl;
        alert("System configuration saved! Reloading...");
        window.location.reload();
    };

    const generateApiKey = async () => {
        const newKey = 'sk_live_' + Math.random().toString(36).substring(2);
        await Utils.callApi("updateSettings", { settings: { APISecret: newKey } });
        settingsData.value.APISecret = newKey;
    };

    const removeApiKey = async () => {
        await Utils.callApi("updateSettings", { settings: { APISecret: "" } });
        settingsData.value.APISecret = "";
    };

    const confirmReset = async (type) => {
        if(!confirm("Are you sure?")) return;
        const res = await Utils.callApi("resetSystem", { type: type });
        if(res.status === 'success') { alert(res.message); loadClients(); }
    };

    const exportToCSV = () => {
        let csv = "ID,Name,Phone,Email,Status\n";
        clientsList.value.forEach(c => { csv += `"${c.id}","${c.name}","${c.phone}","${c.email}","${c.status}"\n`; });
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'clients.csv'; a.click();
    };

    const testWasapmaticMsg = async () => {
        if(!wasapTestPhone.value) return alert('Enter phone');
        loading.value.wasap = true;
        const res = await Utils.callApi("testWasapmatic", { recipient: wasapTestPhone.value });
        loading.value.wasap = false;
        wasapResult.value = JSON.stringify(res);
    };

    const testEmailMsg = async () => {
        if(!emailTestAddress.value) return alert('Enter email');
        loading.value.email = true;
        const res = await Utils.callApi("testEmailTemplate", { email: emailTestAddress.value });
        loading.value.email = false;
        alert(res.message);
    };

    const fetchChangelog = async () => { loading.value.github = true; /* implementation */ loading.value.github = false; };
    const triggerSystemUpdate = async () => { if(confirm("Update?")) { loading.value.update = true; /* implementation */ } };
    const copyPostmanPayload = () => { navigator.clipboard.writeText("{}"); alert("Copied"); };

    // Collects real client metadata: IP, geo, OS, browser
    const getClientMeta = async () => {
        const ua = navigator.userAgent;
        // Parse OS
        let os = 'Unknown';
        if (/Windows NT 10/.test(ua)) os = 'Windows 11/10';
        else if (/Windows NT 6/.test(ua)) os = 'Windows 7/8';
        else if (/Mac OS X/.test(ua)) os = 'macOS';
        else if (/Android/.test(ua)) os = 'Android';
        else if (/iPhone|iPad/.test(ua)) os = 'iOS';
        else if (/Linux/.test(ua)) os = 'Linux';
        // Parse Browser
        let browser = 'Unknown';
        if (/Edg\//.test(ua)) browser = 'Microsoft Edge';
        else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
        else if (/Chrome\//.test(ua)) browser = 'Chrome';
        else if (/Firefox\//.test(ua)) browser = 'Firefox';
        else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';
        // Fetch real IP & Geo from ipapi.co (free, no key needed)
        let ip = 'Unknown', country = 'Unknown', region = 'Unknown', city = 'Unknown';
        try {
            const geo = await fetch('https://ipapi.co/json/').then(r => r.json());
            ip      = geo.ip      || 'Unknown';
            country = geo.country_name || geo.country || 'Unknown';
            region  = geo.region  || 'Unknown';
            city    = geo.city    || 'Unknown';
        } catch(e) { /* geo fetch failed, use defaults */ }
        return { ip, os, browser, country, region, city };
    };

    const runWebhookTest = async () => {
        if (!settingsData.value.N8NWebhookURL) {
            alert("Please save a Webhook URL first!");
            return;
        }
        testingWebhook.value = true;
        try {
            const meta = await getClientMeta();
            if (webhookTestRegion.value) {
                meta.region = webhookTestRegion.value;
                meta.city = webhookTestRegion.value;
            }
            if (webhookTestCountry.value) meta.country = webhookTestCountry.value;
            if (webhookTestOS.value) meta.os = webhookTestOS.value;
            if (webhookTestBrowser.value) meta.browser = webhookTestBrowser.value;

            const res = await Utils.callApi("testWebhook", {
                event: webhookTestEvent.value || "test_ping",
                email: webhookTestEmail.value || "test@example.com",
                phone: webhookTestPhone.value || "60123456789",
                tag: webhookTestTag.value || "Manual-Test",
                metadata: meta
            });
            if (res.status === "success") {
                alert(`✅ Webhook sent!\nIP: ${meta.ip} | ${meta.city}, ${meta.region}, ${meta.country}\nOS: ${meta.os} | Browser: ${meta.browser}`);
            } else {
                alert("Error: " + res.message);
            }
        } catch (e) {
            alert("Network Error: Could not reach the script.");
        } finally {
            testingWebhook.value = false;
        }
    };

    const applyBranding = async () => {
        const res = await Utils.callApi("getBranding");
        if (res.status === "success") {
            document.title = res.data.name + " - Dashboard";
            document.documentElement.style.setProperty('--primary', res.data.color);
        }
    };

    onMounted(() => {
        applyBranding();
        loadClients();
        loadLicenses();
    });

    return {
      formatCurrency, formatDate, user, currentTab, sidebarOpen, pageTitle, switchTab, handleLogout,
      modals, profileForm, openProfileModal, saveProfile,
      configUrl, clientsList, filteredClients, clientFilters, selectedClient, openClientModal, licensesList, loading,
      loadClients, loadLicenses, loadSettings, settingsData, saveSettings, confirmReset,
      systemConfig, saveSystemConfig, generateApiKey, removeApiKey,
      addClientForm, openAddClient, submitAddClient, genLicenseForm, generateLicenseForClient,
      testWebhook, runWebhookTest, webhookTestEvent, webhookTestTag, webhookTestEmail, testingWebhook,
      webhookTestRegion, webhookTestCountry, webhookTestPhone, webhookTestOS, webhookTestBrowser,
      wasapTestPhone, wasapResult, testWasapmaticMsg,
      emailTestAddress, testEmailMsg,
      changelog, fetchChangelog, triggerSystemUpdate,
      copyPostmanPayload,
      analytics, exportToCSV, openQuickCreate, quickCreateForm, systemError, gasEditorUrl
    };
  }
});

app.mount('#app');
