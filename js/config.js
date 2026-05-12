
// GS URL = https://docs.google.com/spreadsheets/d/1gVQiKCfuskMzxIyi6E7pfXaP9uM_2prhhe-kxXXgcLk/


// js/config.js
const CONFIG = {
  // Dynamic settings from localStorage
  get WEB_URL() {
    return localStorage.getItem('SYSTEM_WEB_URL') || "";
  },
  set WEB_URL(v) { localStorage.setItem('SYSTEM_WEB_URL', v); },

  MASTER_HUB_URL: "https://script.google.com/macros/s/AKfycbyqugQrGMxgYX6f2yw_bYI80nXiqA0H4GQv8ZDDR0h8Q9yjaFGiUCEHy3_4TFyEWxklhQ/exec",

  SYSTEM_NAME: "License Generator",
  ENV: "DEBUG", // "DEBUG" or "PRODUCTION"

  PAGINATION_LIMIT: 10,

  DATE_FORMAT: "DD/MM/YY",
  TIME_FORMAT: "HH:MM",
  CURRENCY: "MYR",

  // Storage keys
  TOKEN_KEY: "license_system_token",
  USER_KEY: "license_system_user",

  // Wasapmatic default values
  WASAPMATIC_COUNTRY_CODE: "60",

  // System Update & GitHub settings
  get GITHUB_OWNER() { return localStorage.getItem('SYSTEM_GITHUB_OWNER') || "dgmaven"; },
  set GITHUB_OWNER(v) { localStorage.setItem('SYSTEM_GITHUB_OWNER', v); },

  get GITHUB_REPO() { return localStorage.getItem('SYSTEM_GITHUB_REPO') || "key-license-v1"; },
  set GITHUB_REPO(v) { localStorage.setItem('SYSTEM_GITHUB_REPO', v); },

  get GAS_EDITOR_URL() { return localStorage.getItem('SYSTEM_GAS_EDITOR_URL') || ""; },
  set GAS_EDITOR_URL(v) { localStorage.setItem('SYSTEM_GAS_EDITOR_URL', v); }
};
