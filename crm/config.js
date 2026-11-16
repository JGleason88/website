// Supabase connection for the CRM and the website lead forms.
// Both values are designed to be public: the database only lets the
// website ADD leads, and only your 2-step-verified login can read them.
window.CRM_CONFIG = {
  url: 'https://tpijffsgldqsnpzyppqf.supabase.co',   // e.g. https://abcdefghijklm.supabase.co
  key: 'sb_publishable_L7xQHhfUHPUenGQuIOBC_w_9o89Badd'    // the "publishable" (or legacy "anon") key
};
