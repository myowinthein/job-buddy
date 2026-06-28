export function buildPrompt(currentProfileJson: string, links: string[] = []): string {
  const hyperlinksSection = links.length > 0
    ? `Extracted hyperlinks from document metadata (use these for the links fields):
${links.join('\n')}

`
    : '';

  return `You are a resume parser for a job application autofill tool called Job Buddy.

Extract structured data from the attached resume document and return ONLY a valid JSON object. No markdown, no code blocks, no explanation — raw JSON only.

Schema (omit or set null for any field not found in the resume):

{
  "personal": {
    "firstName": string | null,
    "lastName": string | null,
    "email": string | null,
    "phone": { "countryCode": "ISO-2 e.g. US", "callingCode": "+1", "number": "local digits only" } | null,
    "dateOfBirth": "YYYY-MM-DD" | null
  },
  "address": {
    "city": string | null,
    "country": "ISO 3166-1 alpha-2 e.g. US GB SG" | null,
    "street": string | null,
    "state": string | null,
    "postalCode": string | null
  },
  "professional": {
    "summary": string | null,
    "noticePeriod": {
      "immediate": boolean,
      "value": number | null,
      "unit": "day" | "week" | "month" | null
    } | null
  },
  "salary": {
    "current": { "amount": number | null, "currency": "3-letter ISO 4217 e.g. USD" } | null,
    "expected": []
  },
  "workAuthorization": [
    {
      "country": "ISO alpha-2",
      "status": "citizen_or_pr | work_visa | requires_sponsorship",
      "visaType": string | null
    }
  ],
  "workHistory": [
    {
      "company": string,
      "title": string,
      "startDate": "YYYY-MM",
      "isCurrent": boolean,
      "endDate": "YYYY-MM" | null,
      "location": { "countryCode": "ISO alpha-2" | null, "city": string | null } | null,
      "arrangement": "onsite | remote | hybrid" | null,
      "description": string | null
    }
  ],
  "education": [
    {
      "institution": string,
      "degree": string,
      "fieldOfStudy": string,
      "startDate": "YYYY-MM",
      "isCurrent": boolean | null,
      "endDate": "YYYY-MM" | null,
      "grade": string | null
    }
  ],
  "languages": [
    {
      "language": string,
      "proficiency": "native_bilingual | full_professional | professional_working | limited_working | elementary"
    }
  ],
  "links": {
    "linkedin": string | null,
    "portfolio": string | null
  }
}

Current profile (for conflict detection only — do NOT use as extraction source):
${currentProfileJson}

${hyperlinksSection}Rules:
- Never invent or guess values not present in the document
- Dates: workHistory/education use YYYY-MM; dateOfBirth uses YYYY-MM-DD
- country/countryCode must be ISO 3166-1 alpha-2 (e.g. US, GB, SG, AU, CA, MM)
- currency must be ISO 4217 3-letter code (e.g. USD, GBP, SGD, MMK)
- phone: split calling code from local number; infer country from context if needed
- language proficiency: infer from context ("mother tongue" → native_bilingual, "fluent" → full_professional, "conversational" → professional_working)
- salary.expected: always return empty array []
- Do not include: id, derived, documents, coverLetter
- Return valid JSON only
- For array fields with no data found, return []
- professional.summary: copy verbatim from the resume; preserve paragraph breaks as \\n\\n
- workHistory[].description: include all content under the role — company context, responsibilities, achievements, and bullet points; if multiple sections exist, concatenate them with \\n\\n
- address.state: infer from city only when unambiguous (e.g. Bangkok → Bangkok, London → England); otherwise omit
- workAuthorization: only include if explicitly stated in the resume; omit otherwise
- noticePeriod: if resume says "immediate", "immediately available", or similar → { "immediate": true, "value": null, "unit": null }; if a duration is given → { "immediate": false, "value": <n>, "unit": "day"|"week"|"month" }; if not mentioned → null
- Never guess gender or ethnicity; omit unless explicitly stated in the resume`;
}
