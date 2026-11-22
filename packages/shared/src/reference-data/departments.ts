/**
 * Departments and the job titles in each. Job titles are unique across the whole
 * company, so a title on its own tells you the department (useful for pay comparisons
 * "by job title").
 */
export const DEPARTMENTS = [
  {
    name: 'Engineering',
    jobTitles: [
      'Software Engineer',
      'QA Engineer',
      'DevOps Engineer',
      'Data Engineer',
      'Engineering Manager',
    ],
  },
  {
    name: 'Product',
    jobTitles: ['Product Manager', 'Product Analyst', 'Technical Program Manager'],
  },
  {
    name: 'Design',
    jobTitles: ['Product Designer', 'UX Researcher', 'Design Manager'],
  },
  {
    name: 'Sales',
    jobTitles: ['Sales Development Representative', 'Account Executive', 'Sales Manager'],
  },
  {
    name: 'Marketing',
    jobTitles: ['Content Strategist', 'Growth Analyst', 'Marketing Manager'],
  },
  {
    name: 'Finance',
    jobTitles: ['Accountant', 'Financial Analyst', 'Finance Manager'],
  },
  {
    name: 'HR',
    jobTitles: ['Recruiter', 'People Operations Specialist', 'HR Business Partner'],
  },
  {
    name: 'Operations',
    jobTitles: ['Customer Support Specialist', 'Operations Analyst', 'Operations Manager'],
  },
] as const;

export type DepartmentName = (typeof DEPARTMENTS)[number]['name'];
export type JobTitle = (typeof DEPARTMENTS)[number]['jobTitles'][number];

export const DEPARTMENT_NAMES = DEPARTMENTS.map((department) => department.name);

export const JOB_TITLES = DEPARTMENTS.flatMap((department) => department.jobTitles);

/** True when `jobTitle` is one of the job titles listed under `department`. */
export function isJobTitleInDepartment(department: DepartmentName, jobTitle: JobTitle): boolean {
  return jobTitlesFor(department).includes(jobTitle);
}

export function jobTitlesFor(department: DepartmentName): readonly JobTitle[] {
  const found = DEPARTMENTS.find((d) => d.name === department);
  if (found === undefined) {
    // Unreachable for a valid DepartmentName; guards against bad data that bypassed the types.
    throw new RangeError(`Unknown department: ${department}`);
  }
  return found.jobTitles;
}
