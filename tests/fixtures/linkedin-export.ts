export const FIXTURE_PROFILE_CSV = `First Name,Last Name,Maiden Name,Address,Birth Date,Headline,Summary,Industry,Zip Code,Geo Location,Twitter Handles,Websites,Instant Messengers
Ada,Quill,,"1 Secret St",1990-01-01,Backend engineer,"Builds payment APIs in Go and PostgreSQL. GitHub: github.com/ada-quill",Software,84101,Salt Lake City,,https://ada.example,
`;

export const FIXTURE_RICH_MEDIA_CSV = `Date/Time,Media Description,Media Link
"March 1, 2024","Shipped a billing service in Go with integration tests.",https://example.test/photo.jpg
`;

export const FIXTURE_CONNECTIONS_CSV = `Notes:
"Export notes."

First Name,Last Name,URL,Email Address,Company,Position,Connected On
Ada,Quill,https://www.linkedin.com/in/ada-quill,ada@example.com,"Acme Payments, Inc.",Staff Engineer,15 Jan 2024
`;

export const FIXTURE_JOB = {
  jobTitle: "Senior Backend Engineer",
  jobRequirements:
    "Must have: 3+ years building REST APIs in Go or Java, PostgreSQL, and production deployment experience. Nice: Kubernetes, payment systems.",
};

export const FIXTURE_RESUME = `
Senior Backend Engineer
- Built payment APIs in Go (3 years) with PostgreSQL and Redis caching
- Deployed services on Kubernetes with CI/CD (GitHub Actions)
- Wrote unit and integration tests for core billing flows
`;
