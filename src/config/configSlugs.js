/** Maps URL slug → Supabase table name for standard master config tables (P1-09). */
const CONFIG_SLUG_TO_TABLE = {
  currencies: 'config_currencies',
  'cabin-classes': 'config_cabin_classes',
  'meal-plans': 'config_meal_plans',
  'transfer-types': 'config_transfer_types',
  'visa-types': 'config_visa_types',
  destinations: 'config_destinations',
  'cancellation-reasons': 'config_cancellation_reasons',
  'margin-retention-pct': 'config_margin_retention_pct',
  'refund-methods': 'config_refund_methods',
  'visa-exemption-types': 'config_visa_exemption_types',
  'alert-types': 'config_alert_types',
  'email-templates': 'config_email_templates',
};

const RESERVED_CONFIG_SLUGS = new Set([
  'all',
  'tcs-rate',
  'gst-rate',
  'fx-threshold',
  'default-margin-pct',
]);

/** Tables that include email template fields */
const EMAIL_TEMPLATE_SLUG = 'email-templates';

module.exports = {
  CONFIG_SLUG_TO_TABLE,
  RESERVED_CONFIG_SLUGS,
  EMAIL_TEMPLATE_SLUG,
};
