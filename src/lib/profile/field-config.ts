import type { ProfileFieldConfig, ProfileSection } from "./types.ts";

/**
 * Phase 3B — the first real profile field list, defined after the founder
 * supplied a live UX reference (Mumbai Intel / NoDalalTalks' own profile
 * page) to study. This is a recreation of that reference's SECTION and
 * FIELD structure inside Developer Connect's own architecture — no code,
 * data, or dependency from that other product was imported (see Phase 3B
 * instructions: they are two completely separate platforms).
 *
 * Adapted, not copied, in a few deliberate places:
 *  - Read-only account facts shown on the reference (email, sign-in
 *    method, member-since, last sign-in) are NOT fields here — Developer
 *    Connect's profile page already shows identity info straight from
 *    Clerk (see profile/page.tsx), so duplicating it as a "field" would
 *    be redundant, not a real profile answer.
 *  - "Date of birth" is one native date field here, not three separate
 *    day/month/year selects — same data, fewer taps on mobile.
 *  - "Notification Settings" toggles are scoped to what Developer Connect
 *    actually has (the in-house notification system built alongside this
 *    profile — see notifications/), not the reference's saved-search/
 *    digest toggles, which describe features that don't exist here.
 *
 * PROFILE_SECTIONS and PROFILE_FIELD_CONFIG are read by every part of the
 * completion/analytics system (completion.ts, profile-service.ts,
 * founder profile analytics) — this file is still the single source of
 * truth; nothing downstream hardcodes a field list of its own.
 *
 * All weights are uniformly 1 — a deliberate choice to avoid inventing an
 * arbitrary importance ranking between fields. Completion is always
 * weight / totalWeight, so this can change later without touching the
 * algorithm.
 */

export const PROFILE_SECTIONS: ProfileSection[] = [
  {
    id: "personal-details",
    title: "Personal Details",
    whyItMatters: "Helps us recognize you and keep your profile accurate.",
  },
  {
    id: "budget",
    title: "Budget",
    helperText: 'Type an amount (e.g. "1.2 Cr" or "75 Lakh") or drag the range.',
    whyItMatters: "Helps us understand the kind of properties you're considering.",
  },
  {
    id: "property-type",
    title: "Property Type & Configuration",
    helperText: "Select any that apply.",
    whyItMatters: "Helps us understand what you're actually looking for.",
  },
  {
    id: "property-status",
    title: "Property Status",
    helperText: "What construction stage are you open to? Select any that apply.",
    whyItMatters: "Helps us understand your timeline.",
  },
  {
    id: "purpose",
    title: "What are you looking for?",
    helperText: "Select any that apply.",
    whyItMatters: "Helps us tailor your experience.",
  },
  {
    id: "preferred-locations",
    title: "Preferred Locations",
    whyItMatters: "Helps us make your research more relevant.",
  },
  {
    id: "family-household",
    title: "Family / Household",
    helperText: "Optional and private — never shown publicly. Helps us understand space and budget needs.",
    whyItMatters: "Helps us understand space and budget needs.",
  },
  {
    id: "notification-settings",
    title: "Notification Settings",
    whyItMatters: "Your choice — you can turn these on or off any time.",
  },
];

const PREFERRED_LOCALITIES = [
  "Andheri East", "Andheri West", "Bandra East", "Bandra West", "Borivali East", "Borivali West",
  "Byculla", "Chembur", "Colaba", "Dadar East", "Dadar West", "Dahisar", "Goregaon East",
  "Goregaon West", "Juhu", "Kandivali East", "Kandivali West", "Kurla", "Lower Parel", "Mahim",
  "Malad East", "Malad West", "Matunga", "Mulund East", "Mulund West", "Parel", "Powai",
  "Santacruz East", "Santacruz West", "Sion", "Vikhroli", "Vile Parle East", "Vile Parle West",
  "Worli",
].map((name) => ({ value: name, label: name }));

export const PROFILE_FIELD_CONFIG: ProfileFieldConfig[] = [
  // Personal Details
  { key: "name", label: "Name", weight: 1, section: "personal-details", type: "text" },
  {
    key: "phone",
    label: "Phone",
    weight: 1,
    section: "personal-details",
    type: "text",
    placeholder: "e.g. +91 98765 43210",
  },
  { key: "city", label: "City", weight: 1, section: "personal-details", type: "text" },
  {
    key: "locality",
    label: "Current locality",
    weight: 1,
    section: "personal-details",
    type: "text",
  },
  {
    key: "dateOfBirth",
    label: "Date of birth",
    weight: 1,
    section: "personal-details",
    type: "date",
    helperText: "Helps us understand which life stage to tailor research for.",
  },
  {
    key: "gender",
    label: "Gender",
    weight: 1,
    section: "personal-details",
    type: "select",
    options: [
      { value: "male", label: "Male" },
      { value: "female", label: "Female" },
      { value: "prefer_not_to_say", label: "Prefer not to say" },
    ],
  },

  // Budget
  {
    key: "budgetRange",
    label: "Budget range",
    weight: 1,
    section: "budget",
    type: "range",
  },

  // Property Type & Configuration
  {
    key: "propertyTypes",
    label: "Property type",
    weight: 1,
    section: "property-type",
    type: "multiselect",
    options: [
      { value: "residential", label: "Residential" },
      { value: "commercial", label: "Commercial" },
      { value: "plot", label: "Plot" },
      { value: "mixed_use", label: "Mixed Use" },
    ],
  },
  {
    key: "configurations",
    label: "Configuration",
    weight: 1,
    section: "property-type",
    type: "multiselect",
    options: [
      { value: "1_bhk", label: "1 BHK" },
      { value: "2_bhk", label: "2 BHK" },
      { value: "3_bhk", label: "3 BHK" },
      { value: "4_plus_bhk", label: "4+ BHK" },
      { value: "penthouse", label: "Penthouse" },
      { value: "duplex", label: "Duplex" },
      { value: "bungalow", label: "Bungalow" },
      { value: "plot", label: "Plot" },
      { value: "land", label: "Land" },
    ],
  },

  // Property Status
  {
    key: "constructionStages",
    label: "Construction stage",
    weight: 1,
    section: "property-status",
    type: "multiselect",
    options: [
      {
        value: "pre_launch",
        label: "Pre-launch",
        description: "Announced or marketed, but formal construction hasn't started yet.",
      },
      {
        value: "new_launch",
        label: "New Launch",
        description: "Recently launched, construction underway or just starting.",
      },
      {
        value: "under_construction",
        label: "Under Construction",
        description: "Construction is actively in progress.",
      },
      {
        value: "near_possession",
        label: "Near Possession",
        description: "Expected possession within 6 months.",
      },
      {
        value: "ready_to_move",
        label: "Ready to Move",
        description: "Construction complete, ready for possession now.",
      },
    ],
  },

  // What are you looking for?
  {
    key: "purpose",
    label: "Purpose",
    weight: 1,
    section: "purpose",
    type: "multiselect",
    helperText: "You can be both.",
    options: [
      { value: "self_use", label: "Self Use" },
      { value: "investment", label: "Investment" },
      { value: "just_researching", label: "Just Researching" },
    ],
  },

  // Preferred Locations
  {
    key: "preferredLocations",
    label: "Preferred locations",
    weight: 1,
    section: "preferred-locations",
    type: "location-multiselect",
    options: PREFERRED_LOCALITIES,
    placeholder: "Add a location or landmark",
  },

  // Family / Household
  {
    key: "familySize",
    label: "Family size",
    weight: 1,
    section: "family-household",
    type: "select",
    privacyNote: "Private — never shown publicly, saved automatically.",
    options: [
      { value: "1", label: "1" },
      { value: "2", label: "2" },
      { value: "3", label: "3" },
      { value: "4", label: "4" },
      { value: "5", label: "5" },
      { value: "6_plus", label: "6+" },
      { value: "prefer_not_to_say", label: "Prefer not to say" },
    ],
  },
  {
    key: "familyIncome",
    label: "Family income",
    weight: 1,
    section: "family-household",
    type: "select",
    options: [
      { value: "below_5l", label: "Below ₹5 Lakh" },
      { value: "5_10l", label: "₹5–10 Lakh" },
      { value: "10_20l", label: "₹10–20 Lakh" },
      { value: "20_50l", label: "₹20–50 Lakh" },
      { value: "50l_1cr", label: "₹50 Lakh–₹1 Crore" },
      { value: "1cr_plus", label: "₹1 Crore+" },
      { value: "prefer_not_to_say", label: "Prefer not to say" },
    ],
  },

  // Notification Settings
  {
    key: "notifyProfileCompletionTips",
    label: "Notify me about profile completion tips",
    weight: 1,
    section: "notification-settings",
    type: "boolean",
    helperText: "Occasional, sparse nudges — never more than one at a time.",
  },
  {
    key: "notifyProductUpdates",
    label: "Notify me about product updates and new features",
    weight: 1,
    section: "notification-settings",
    type: "boolean",
    helperText: "Stored for future use — Developer Connect doesn't send product-update notifications yet.",
  },
];
