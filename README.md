# Job Buddy

AI-powered job application assistant browser extension

Save your profile once and use Job Buddy to fill supported job application forms.
Import your resume, review your details, and fill forms with one click.

[Chrome Web Store](https://chromewebstore.google.com/detail/job-buddy/oaadklbdofbaanfcijknaehfkbekdmbk) · [Website & Docs](https://myowinthein.github.io/job-buddy/)

<img src="docs/assets/images/autofill-demo.png?v=109e0d8f927a" alt="Job Buddy autofilling the original Morrow Studio demo application with sample profile details" width="1000">

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

Your profile stays in your browser. Resume import and autofill send relevant data
to Gemini.

<a name="help-me-improve-it"></a>

## Contributing

If you find a bug or have an idea for Job Buddy, [open an issue](https://github.com/myowinthein/job-buddy/issues/new/choose).

## License

[MIT](LICENSE) © 2026 Myo Win Thein (Martin).

<!-- last-reviewed: 8cde4d4301f40fba8337ffe54f86aad8de0c09ef -->
