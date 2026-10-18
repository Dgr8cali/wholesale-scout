# Amazon Ads bulk upload error report (bulk-error-report.xlsx)

What Amazon Ads (Campaign manager → Bulk operations → upload history → download the report) returns
for a failed upload. This one is the first real upload, the B0HM8FBX3T launch sheet on 18 Oct 2026,
rejected because the file carried the export's "Sheet3" version sheet.

The report has a sheet per uploaded sheet, plus a summary:

- **Upload processing summary**: free text in columns A–E.
  - Row 1, "Warning" in A, then B: "This spreadsheet fails to pass the system validation… no change was applied." (only on a failed file).
  - A block "Note on error types" defining Warning, Input error, Input error/Warning and System error (wait 30 minutes and re-upload).
  - Counts, label in B and the number in D: "Number of records processed", "… successful", "… with errors", "… with warnings".
  - A link to the error documentation: https://advertising.amazon.com/API/docs/en-us/bulksheets/2-0/bulksheets-error-reports
  - A table headed "Original sheet | Original record # | Error type | Error code | Error message". Record ranges like "2-51" group rows with the same message.
- **Sponsored Products Campaigns** (and any other uploaded sheet): the uploaded rows as sent, in the
  bulk columns, then an empty column and "Original sheet", "Original record #" (the 1-based row in
  the upload, header = 1), "Error type", "Error code", "Error message" on every row.
- A sheet that failed as a whole (here "Sheet3"): an empty column A, then the same five error columns, one row.

In this report the one Input error was `Sheet3 / 1 / Input error / Invalid headers`: "the first three
column headers must be "Product", "Entity" then "Operation"". The 50 campaign rows were all
`Warning / Not processed`: "This row was not processed due to errors from other rows". The upload
now writes the "Sponsored Products Campaigns" sheet alone (src/lib/ads/bulk.ts, `writeBulk`).
