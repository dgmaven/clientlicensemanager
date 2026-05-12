// js/auth.js

const Auth = {
  /**
   * Check if user is authenticated
   * @returns {boolean}
   */
  isAuthenticated() {
    return localStorage.getItem(CONFIG.TOKEN_KEY) !== null;
  },

  /**
   * Get current user data
   * @returns {object|null}
   */
  getUser() {
    const userStr = localStorage.getItem(CONFIG.USER_KEY);
    return userStr ? JSON.parse(userStr) : null;
  },

  /**
   * Attempt login
   * @param {string} email 
   * @param {string} password 
   * @returns {Promise<boolean>}
   */
  async login(email, password) {
    const response = await Utils.callApi("login", { email, password });
    
    if (response.status === "success") {
      localStorage.setItem(CONFIG.TOKEN_KEY, "simulated_token_" + Date.now());
      localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(response.data));
      return true;
    }
    
    return false;
  },

  /**
   * Logout and clear session
   */
  logout() {
    localStorage.removeItem(CONFIG.TOKEN_KEY);
    localStorage.removeItem(CONFIG.USER_KEY);
    window.location.href = "login.html";
  }
};
