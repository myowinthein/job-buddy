document.getElementById('root')!.innerHTML = `<form><h1>Job application</h1>
<label>First name<input name="firstName" required></label><label>Email<input name="email" type="email" required></label>
<label for="degree-native">Highest Education Obtained</label><div><button type="button" data-menu-id="degree-menu" aria-haspopup="true" aria-expanded="false">–Select–</button><select id="degree-native" name="educationLevel" readonly aria-hidden="true" style="width:0;height:0;opacity:0"><option value=""></option></select></div>
<label>What is your English skill level (None, Basic, Intermediate, Good, Fluent, Native)?<textarea id="english"></textarea></label>
<label>What was your GPA at university?<textarea id="grade"></textarea></label>
<label>What was your salary in your previous job?<textarea id="salary"></textarea></label>
<label>List any certifications that you hold:<textarea id="certifications"></textarea></label></form>`;
const button = document.querySelector<HTMLButtonElement>('button[data-menu-id]')!;
button.addEventListener('click', () => {
  if (document.getElementById('degree-menu')) return;
  button.setAttribute('aria-expanded', 'true');
  document.body.insertAdjacentHTML(
    'beforeend',
    '<div id="degree-menu" role="menu"><div role="menuitem"><span>College - Bachelor of Arts</span></div><div role="menuitem"><span>College - Bachelor of Science</span></div></div>',
  );
  for (const option of document.querySelectorAll<HTMLElement>('[role=menuitem]'))
    option.addEventListener('click', () => {
      setTimeout(() => {
        button.textContent = option.textContent;
        const select = document.querySelector<HTMLSelectElement>('#degree-native')!;
        select.replaceChildren(
          new Option('', option.textContent!.includes('Science') ? 'science' : 'arts', true, true),
        );
        button.setAttribute('aria-expanded', 'false');
        document.getElementById('degree-menu')?.remove();
      }, 20);
    });
});
