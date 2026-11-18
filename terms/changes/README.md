# Summaries of changes to the Terms

For each new Terms version that changes what members agree to, the owner
supplies a summary of the changes in each language, as a plain text file:

    terms/changes/<version>.en.txt
    terms/changes/<version>.es.txt

`npm run terms:seed` reads them and writes the summary into that version's
migration (`change_summary`). When a version is published, every approved
member is emailed this summary, the date it takes effect and a link (sql/056).

A version with approved members to email but no summary is refused at
publish time. A version with no summary file has no summary; that is correct
only when no approved member in that language will be emailed.

The wording is the owner's. Do not write these files for him.
