const demoValues = {
  firstName: "Myo",
  lastName: "Win Thein",
  email: "myo@example.com",
  phone: "+66 80 123 4567",
  address: "88 Wireless Road",
  city: "Bangkok",
  state: "Bangkok",
  postalCode: "10330",
  country: "Thailand",
  linkedin: "https://linkedin.com/in/myowinthein",
  portfolio: "https://myowin.dev",
  currentSalary: "120000",
  expectedSalary: "150000",
  workAuthorization: "Authorized to work",
  currentCompany: "StudyMe",
  currentTitle: "Senior Software Engineer",
  summary: "Product-minded senior software engineer with strong backend, cloud, and full-stack experience across SaaS platforms, internal tools, and workflow automation.",
  school: "University of Greenwich",
  degree: "BSc Information Technology",
  fieldOfStudy: "Information Technology"
};

function fillDemoData() {
  const form = document.getElementById("applicationForm");

  Object.entries(demoValues).forEach(([name, value], index) => {
    const field = form.elements[name];

    if (!field) return;

    setTimeout(() => {
      field.value = value;
      field.classList.add(index % 7 === 0 ? "review" : "autofilled");
    }, index * 90);
  });

  const resume = form.elements["resume"];
  const uploadBox = resume.closest(".upload-box");
  uploadBox.classList.add("missing");
}

function clearDemoData() {
  const form = document.getElementById("applicationForm");
  form.reset();

  form.querySelectorAll("input, select, textarea").forEach((field) => {
    field.classList.remove("autofilled", "review", "missing");
  });

  document.querySelector(".upload-box").classList.remove("missing");
}

document.getElementById("resetButton").addEventListener("click", clearDemoData);

document.getElementById("applicationForm").addEventListener("submit", (event) => {
  event.preventDefault();
  alert("Demo only. No application was submitted.");
});

// For screenshot/demo convenience.
// Press F to simulate Job Buddy autofill.
document.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "f") {
    fillDemoData();
  }
});

window.JobBuddyDemo = {
  fill: fillDemoData,
  clear: clearDemoData
};
