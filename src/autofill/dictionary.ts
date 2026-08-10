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
  // Scoped to explicitly "current"-qualified labels only — these correctly
  // resolve to empty when the applicant has no active job (calculateDerivedFields
  // only considers isCurrent entries), which is the right behavior for a field
  // that specifically asks about *current* employment. Generic, unqualified
  // labels ("Company", "Job Title") go through workHistory.company/title
  // instead (see workHistoryResolution.ts) so they still resolve to the most
  // recent past job when nothing is currently active.
  'derived.currentTitle':          ['currenttitle', 'currentposition', 'currentrole'],
  'derived.currentCompany':        ['currentcompany', 'currentemployer'],
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
  // Distinct from availableDate above — a "Notice Period" duration dropdown
  // needs "Immediate"/"2 Weeks"/"1 Month", not a computed calendar date.
  'professional.noticePeriod.formatted': ['noticeperiod', 'periodofnotice', 'noticerequired', 'noticetime'],
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
  // Deliberately NOT bare 'startdate'/'enddate' — those collide with the
  // identical bare wording work history sections commonly use (see
  // workHistory.startDate.formatted below), and the dictionary has no
  // section-aware way to tell them apart. Only qualified, unambiguous-by-
  // construction phrasings are registered; a bare "Start Date" field falls
  // back to AI, which does get section context (nearbyText) this dictionary
  // layer doesn't have.
  'education.startDate.formatted': ['educationstartdate', 'schoolstartdate', 'enrollmentdate', 'yearstarted'],
  'education.endDate.formatted':   ['educationenddate', 'schoolenddate', 'graduationdate', 'yearcompleted', 'yeargraduated'],
  // For a select/radio/text "currently enrolled" field — safe via the normal
  // fill mechanics (only ever sets a value among the page's own options).
  // The separate checkbox case is intentionally NOT here — see
  // educationResolution.ts's matchCurrentEducationCheckboxes for why a
  // checkbox needs its own narrower, exact-match-only path.
  'education.isCurrent':           ['currentlyenrolled', 'currentlystudying', 'currentstudent', 'isstillenrolled', 'presentlyenrolled'],
  // Same unindexed-marker pattern, resolved by adjustWorkHistoryMatches() in
  // workHistoryResolution.ts.
  'workHistory.company':           ['company', 'employer', 'organization', 'organisation', 'companyname', 'employername'],
  'workHistory.title':             ['jobtitle', 'position', 'role', 'jobposition', 'jobrole'],
  'workHistory.location':          ['worklocation', 'joblocation', 'officelocation', 'employmentlocation'],
  'workHistory.location.city':     ['workcity', 'jobcity', 'officecity', 'employmentcity'],
  'workHistory.location.countryName': ['workcountry', 'jobcountry', 'officecountry', 'countryofemployment'],
  // See the education date comment above for why these are qualified, not bare.
  'workHistory.startDate.formatted': ['employmentstartdate', 'jobstartdate', 'workstartdate', 'startdateofemployment', 'datestarted'],
  'workHistory.endDate.formatted':   ['employmentenddate', 'jobenddate', 'workenddate', 'enddateofemployment', 'lastdayofwork', 'dateended'],
  'workHistory.isCurrent':         ['currentlyworking', 'currentlyemployed', 'currentjob', 'isthisyourcurrentjob', 'presentlyemployed'],
  'workHistory.description':       ['jobdescription', 'responsibilities', 'roledescription', 'workdescription', 'dutiesandresponsibilities'],
  'workHistory.arrangement':       ['workarrangement', 'employmenttype', 'workmode', 'worktype', 'remoteoronsite'],
};
