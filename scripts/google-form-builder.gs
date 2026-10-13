/**
 * Builds the Developer Connects enquiry as a Google Form in ONE run: every question is a tap (multiple choice or tick boxes), only the
 * phone number and an optional name are typed. Responses land in a Google Sheet next to the form.
 *
 * HOW TO USE (2 minutes, signed in as developerconnects02@gmail.com so the form belongs to the company account):
 *   1. Open https://script.google.com and choose New project.
 *   2. Delete the sample code, paste this whole file, press Save.
 *   3. Choose the function createDeveloperConnectsForm and press Run. Approve the permissions when asked.
 *   4. Open View > Execution log: it prints the link to SHARE (put it in the bio) and the link to EDIT.
 *
 * The same questions, in the same order, as developerconnects.com/enquire. That page is the better bio link because each answer
 * becomes a lead in the Founder dashboard automatically; a Google Form keeps its answers in Google Sheets only.
 */
function createDeveloperConnectsForm() {
  var form = FormApp.create('Tell us what you need | Developer Connects');
  form.setDescription(
    'Developer Connects: property advisory for Mumbai and Dubai.\n\n' +
    '0% commission on primary (new-launch) sales. On secondary (resale) and rental transactions, commission is applicable as per market standards.\n' +
    'Founder: Ambish Singh. First-generation real estate entrepreneur, 6+ years of real estate strategy and investment experience, ' +
    'Rs 300 Cr+ of property transactions executed (still counting), MBA in Strategy, Symbiosis International University, Dubai.\n\n' +
    'Just tap your answers. It takes about a minute.\n\n' +
    'WhatsApp: +91 98337 50932  |  Business enquiries: developerconnects02@gmail.com  |  developerconnects.com'
  );
  form.setCollectEmail(false);
  form.setAllowResponseEdits(false);
  form.setShowLinkToRespondAgain(true);
  form.setProgressBar(true);
  form.setConfirmationMessage('Thank you. We have your requirements and will contact you shortly on the number you gave. You can also message us on WhatsApp: +91 98337 50932.');

  function choice(title, options, required) {
    var item = form.addMultipleChoiceItem().setTitle(title).setRequired(!!required);
    item.setChoiceValues(options);
    return item;
  }
  function ticks(title, options, max) {
    var item = form.addCheckboxItem().setTitle(title).setChoiceValues(options);
    item.setHelpText('Tick up to ' + max);
    item.setValidation(FormApp.createCheckboxValidation().requireSelectAtMost(max).build());
    return item;
  }

  choice('What are you looking to do?', ['Buy a property', 'Invest in property', 'Rent a property', 'Sell my property', 'Rent out my property'], true);
  choice('Which city?', ['Mumbai', 'Dubai', 'Somewhere else'], true);
  ticks('Which areas? (Mumbai)', ['South Mumbai', 'Central Mumbai', 'Western suburbs', 'Eastern suburbs', 'Thane', 'Navi Mumbai', 'Mira Road / Bhayandar', 'Vasai / Virar', 'Panvel / Kharghar', 'Open to suggestions'], 3);
  ticks('Which areas? (Dubai)', ['Downtown Dubai', 'Dubai Marina / JBR', 'Business Bay', 'Palm Jumeirah', 'Jumeirah Village Circle', 'Dubai Hills', 'Dubai Creek Harbour', 'Open to suggestions'], 3);
  choice('What type of property?', ['Apartment', 'Villa / independent house', 'Plot / land', 'Office', 'Shop / retail']);
  ticks('What size?', ['Studio / 1 RK', '1 BHK', '2 BHK', '3 BHK', '4 BHK or more', 'Not sure yet'], 2);
  choice('Budget in India (Rs)', ['Under Rs 50 lakh', 'Rs 50 lakh - 1 crore', 'Rs 1 - 2 crore', 'Rs 2 - 3 crore', 'Rs 3 - 5 crore', 'Rs 5 - 10 crore', 'Above Rs 10 crore']);
  choice('Budget in Dubai (AED)', ['Under AED 500K', 'AED 500K - 1M', 'AED 1 - 2M', 'AED 2 - 3M', 'AED 3 - 5M', 'Above AED 5M']);
  choice('Is it for you to live in, or an investment?', ['To live in it', 'As an investment']);
  choice('How soon are you planning?', ['Within a month', '1 to 3 months', '3 to 6 months', 'More than 6 months', 'Just exploring']);
  choice('Ready to move in, or under construction?', ['Ready to move in', 'Under construction', 'Either is fine']);
  choice('Do you need a home loan?', ['Yes, I need a home loan', 'No, self-funded', 'Not sure yet']);
  choice('How should we reach you?', ['WhatsApp', 'Phone call'], true);
  choice('When is a good time?', ['Morning (9-12)', 'Afternoon (12-4)', 'Evening (4-8)', 'Any time']);
  choice('How did you find us?', ['Instagram', 'YouTube', 'Facebook', 'LinkedIn', 'Google search', 'A friend or family', 'Somewhere else']);

  form.addTextItem().setTitle('Your name (optional)');
  var phone = form.addTextItem().setTitle('Your WhatsApp or phone number (with country code)').setRequired(true);
  phone.setValidation(FormApp.createTextValidation().setHelpText('Enter a valid phone number, for example +91 98765 43210').requireTextMatchesPattern('^\\+?[0-9 ()-]{8,18}$').build());

  var sheet = SpreadsheetApp.create('Developer Connects enquiries (responses)');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());

  Logger.log('SHARE this link (put it in the bio): ' + form.getPublishedUrl());
  Logger.log('EDIT the form here: ' + form.getEditUrl());
  Logger.log('Responses sheet: ' + sheet.getUrl());
}
