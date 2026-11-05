// Preserve useful destinations from bookmarks to the retired overview.
const destinations = {
  problem: 'start',
  users: 'start',
  features: 'profile',
  workflow: 'autofill',
  data: 'your-data',
  permissions: 'your-data',
  limitations: 'autofill',
  roadmap: 'start',
  tech: 'developers/',
  status: 'start',
  links: 'start',
};
const target = destinations[location.hash.slice(1)] || 'start';
location.replace(target.endsWith('/') ? '../' + target : '../#' + target);
