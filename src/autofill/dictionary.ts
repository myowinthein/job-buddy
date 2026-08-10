export const FIELD_DICTIONARY: Record<string, string[]> = {
  'personal.firstName':            ['firstname', 'fname', 'givenname', 'forename', 'firstnm'],
  'personal.lastName':             ['lastname', 'lname', 'familyname', 'surname', 'lastnm'],
  'personal.nickname':             ['nickname', 'preferredname', 'goesby', 'knownas'],
  'personal.email':                ['email', 'emailaddress', 'workemail', 'contactemail'],
  'personal.phone.full':           ['phone'],
  'personal.phone.number':         ['phonenumber', 'mobile', 'cellphone', 'telephone', 'mobilenumber', 'localnumber'],
  'personal.phone.callingCode':    ['countrycode', 'callingcode', 'dialingcode', 'dialcode', 'phonecode'],
  'personal.gender':               ['gender', 'sex'],
  'personal.ethnicity':            ['ethnicity', 'race', 'raceethnicity'],
  'personal.veteranStatus':        ['veteranstatus', 'veteran'],
  'personal.disabilityStatus':     ['disabilitystatus', 'disability'],
  'address.city':                  ['city', 'town', 'cityofresidence', 'currentcity'],
  'address.country':               ['country', 'countryofresidence', 'nationality', 'countryoforigin'],
  'address.street':                ['street', 'streetaddress', 'address', 'addressline1'],
  'address.state':                 ['state', 'province', 'region', 'stateorprovince'],
  'address.postalCode':            ['postalcode', 'zipcode', 'zip', 'postcode'],
  'derived.fullName':              ['fullname', 'name', 'yourname', 'applicantname'],
  'derived.currentTitle':          ['jobtitle', 'currenttitle', 'position', 'currentposition', 'role', 'currentrole'],
  'derived.currentCompany':        ['company', 'employer', 'currentcompany', 'currentemployer', 'organization', 'organisation'],
  'derived.totalExperience.years': ['yearsofexperience', 'experience', 'totalexperience', 'yearofexperience'],
  'derived.age':                   ['age', 'currentage', 'yourage'],
  'links.linkedin':                ['linkedin', 'linkedinurl', 'linkedinprofile', 'linkedinlink'],
  'links.portfolio':               ['portfolio', 'portfoliourl', 'personalwebsite', 'website', 'portfoliowebsite', 'portfoliolink', 'personalwebsiteurl', 'portfoliowebsiteurl', 'websiteorportfolio', 'websiteblogportfolio', 'websiteblogorportfolio', 'onlineportfolio', 'blogorwebsite', 'websiteorblog'],
  'professional.summary':          ['summary', 'aboutme', 'bio', 'aboutyourself', 'profilesummary', 'professionalsummary'],
  'languages.formatted':           ['languages', 'languagesspoken', 'languagesknown', 'spokenlanguages', 'languageskills'],
  // Unindexed markers for a multi-entry language+proficiency dropdown pair —
  // never resolve directly (there is no bare 'languages.language' data).
  // adjustLanguageMatches() in languageResolution.ts rewrites these to a
  // concrete languages.N.* path after every field on the page is scanned,
  // the same pattern phoneResolution.ts uses for ambiguous phone fields.
  'languages.language':            ['language', 'languagespoken', 'languagename'],
  'languages.proficiency':         ['proficiency', 'fluency', 'languageproficiency', 'languagelevel', 'proficiencylevel'],
  'salary.current.amount':         ['currentsalary', 'currentctc', 'currentcompensation', 'currentsalaryexpectation'],
  'salary.expected':               ['expectedsalary', 'desiredcompensation', 'expectedctc', 'desiredsalary', 'salaryexpectation'],
  'professional.noticePeriod.availableDate': ['dateavailable', 'availablefrom', 'availabledate', 'earlieststartdate', 'availabletostart', 'startavailability', 'availabilitydate'],
  'workAuthorization':             ['workauthorization', 'workpermit', 'authorizedtowork', 'eligibletowork', 'workeligibility'],
  // Also covers a URL/text field sharing the same label wording — mapper.ts's
  // resolveDictionaryHit() redirects to documents.cv.url for a non-file
  // element, so this entry doesn't need duplicate aliases of its own.
  'documents.cv.file':             ['resume', 'cv', 'curriculumvitae', 'resumeupload', 'uploadresume', 'attachresume', 'document', 'attachment', 'uploadcv', 'myresume'],
  // Unindexed markers, same pattern as languages.language/proficiency above —
  // adjustEducationMatches() in educationResolution.ts rewrites these to a
  // concrete education.N.* path (single field on the page → the applicant's
  // most recent entry; repeated fields → sequential index per occurrence).
  'education.institution':         ['institution', 'school', 'university', 'college', 'schoolname', 'universityname', 'institutionname', 'collegename'],
  'education.degree':              ['degree', 'degreetype', 'qualification', 'degreeearned', 'levelofeducation', 'educationlevel'],
  'education.fieldOfStudy':        ['fieldofstudy', 'major', 'areaofstudy', 'concentration', 'specialization', 'majorfield', 'course', 'discipline'],
  // 'startdate'/'enddate' are common bare labels within an Education fieldset
  // but are inherently ambiguous against any other section using the same
  // wording (e.g. a future workHistory dictionary) — there is no section-aware
  // disambiguation today, so this is a known, accepted collision risk.
  'education.startDate.formatted': ['educationstartdate', 'startdate', 'yearstarted', 'schoolstartdate', 'enrollmentdate'],
  'education.endDate.formatted':   ['educationenddate', 'enddate', 'yearcompleted', 'schoolenddate', 'graduationdate'],
  // For a select/radio/text "currently enrolled" field — safe via the normal
  // fill mechanics (only ever sets a value among the page's own options).
  // The separate checkbox case is intentionally NOT here — see
  // educationResolution.ts's matchCurrentEducationCheckboxes for why a
  // checkbox needs its own narrower, exact-match-only path.
  'education.isCurrent':           ['currentlyenrolled', 'currentlystudying', 'currentstudent', 'isstillenrolled', 'presentlyenrolled'],
};
