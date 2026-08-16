-- Apply this once to an existing MaryResult database created before Google sign-in support.
USE maryresult;

ALTER TABLE users ADD COLUMN google_sub VARCHAR(255) NULL AFTER email;
ALTER TABLE users ADD UNIQUE KEY uq_user_google_sub (google_sub);

-- Align the original seeded administrator with the documented Gmail login.
UPDATE users
SET email = 'bamidelebunmi412@gmail.com'
WHERE email = 'admin@maryfield.edu';