// Supabase connection for the CRM and the website lead forms.
// Both values are designed to be public: the database only lets the
// website ADD leads, and only your 2-step-verified login can read them.
window.CRM_CONFIG = {
  url: '',   // e.g. https://abcdefghijklm.supabase.co
  key: ''    // the "publishable" (or legacy "anon") key
};
