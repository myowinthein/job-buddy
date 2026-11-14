# Job Buddy

AI-powered browser extension for job applications

Save your profile once and use Job Buddy to fill supported job application forms.
Import your resume, review your details, and fill forms with one click.

[![Add to Chrome](docs/assets/badges/add-to-chrome.svg)](https://chromewebstore.google.com/detail/job-buddy/oaadklbdofbaanfcijknaehfkbekdmbk)
[![Website & Docs](docs/assets/badges/website-and-docs.svg)](https://myowinthein.github.io/job-buddy/)

<img src="docs/assets/images/autofill-demo.png?v=209f43c0914c" alt="Job Buddy autofilling the original Morrow Studio demo application with sample profile details" width="1000">

## Why I built this

While actively looking for a job, I found myself filling out several application
forms every day. Repeating the same personal details, work history, and education
was exhausting and took time away from the search itself.

I tried extensions from the Chrome Web Store. Some included job listings, resume
matching, and other features I didn't need. Others were simpler, but didn't fill
forms as accurately as I wanted.

That's why I built Job Buddy. I wanted a simple, reliable extension that could read
my resume and use AI to help fill application forms in one click. I built it for my
own job search and made it free and open source for others to use.

## How to use it

After installing Job Buddy, you need a
[Gemini API key](https://aistudio.google.com/api-keys). Gemini offers a free tier, with
[usage limits](https://ai.google.dev/gemini-api/docs/rate-limits) that vary by model.
A resume in PDF or DOCX format is optional. You can import your details from it or
enter them manually.

Follow the [walkthrough](https://myowinthein.github.io/job-buddy/#start) to set up
Job Buddy, add your profile and start autofill.

Your profile stays in your browser unless you turn on the optional Google Drive
backup. Resume import, autofill and mapping reviews send relevant data to
Gemini. See the [privacy policy](https://myowinthein.github.io/job-buddy/legal/privacy/).

<a name="help-me-improve-it"></a>

## Contributing

If a feature behaves unexpectedly, a guide is unclear or you have an idea for Job Buddy, [open an issue](https://github.com/myowinthein/job-buddy/issues/new/choose).

## License

Job Buddy is licensed under the [MIT License](LICENSE). © 2026 Myo Win Thein.

<!-- last-reviewed: e2142627e4efef37f8b30ca2a981bad40a595315 -->
