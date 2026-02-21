# Found Sets

**NOTE:** Items marked with **(step)** are script steps. Items marked with **(function)** are calculation functions used inside expressions. This distinction matters: script steps become `<Step>` elements in fmxmlsnippet output, while functions appear inside `<Calculation><![CDATA[...]]></Calculation>` blocks.

## Attributes of Found Sets

- A Found Set is a list of specific records.
- `Perform Find` **(step)** can create a found set or empty set.
- New records from any client are not added to any other client's Found Set.
- Record deletions do impact the found set for all clients.
- `Constrain Found Set` **(step)** & `Extend Found Set` **(step)** preserve any applied sort order.
- A zero-record found set based on `Perform Find` removes the previous sort order.
- A `New Window` **(step)** will retain a copy of the same found set and sort order. The new window's found set is independent — constraining or extending in one window does not affect the other.

## Multi-user behavior

The asymmetry between record creation and deletion in a multi-user environment is important to account for in scripts:

- **Record creation:** A new record created by any client is _not_ added to any other client's found set. Other clients must re-find or extend their found set to see new records.
- **Record deletion:** A deleted record _is_ removed from every client's found set. Scripts that loop through records should account for the possibility that `Get ( FoundCount )` may decrease mid-loop if another user deletes a record.

## Actions that operate on a Found Set

### Script steps

- `Loop` **(step)** — iterate through records using `Go to Record/Request/Page [ Next ; Exit after last: On ]`.
- `Replace Field Contents` **(step)** — apply a calculation or serial number to a field across all records in the found set.
- `Delete All Records` **(step)** — delete every record in the found set, with or without a dialog prompt.
- `Check Found Set` **(step)** — check spelling in all fields of all records.
- `Relookup Field Contents` **(step)** — re-trigger the lookup defined on a relationship for all records.
- `Send Mail` **(step)** — has an option titled "Multiple emails (one for each record in found set)".
- `Copy All Records/Requests` **(step)** — copies tab-delimited data from all fields shown on the layout for the current found set to the clipboard.
- `Import Records` **(step)** — the Update and Replace options operate only on the current found set.
- `Export Records` **(step)** — exports the current found set.
- `Save Records as Snapshot Link` **(step)** — when using _Records being browsed_, outputs a snapshot link file to any path (see example below).

### Calculation functions

- `GetSummary ( summaryField ; breakField )` **(function)** — returns aggregate values from summary fields across the found set.
- `GetNthRecord ( field ; recordNumber )` **(function)** — returns a field value from a specific record number in the found set. Can be used with a `Loop` or `While ( [ initialVariable ] ; condition ; [ logic ] ; result )`.
- `GetRecordIDsFromFoundSet ( type )` **(function)** — returns internal record IDs for the found set. The `type` parameter controls the format.

## Methods of collecting values from the Found Set

There are three common approaches, each with different trade-offs:

### 1. Loop (most flexible, slowest on large sets)

A record loop collects field values into a `$variable` or field one record at a time.

### 2. Summary field + GetSummary (no scripting required)

If the table has a Summary field using the **List of** type, the `GetSummary ( summaryField ; breakField )` function returns the aggregated values. This evaluates without looping.

### 3. Replace Field Contents + List()

This technique uses `Replace Field Contents` with a calculation to accumulate values across all records in a single pass. It requires a global text field as an accumulator.

```
Set Field [ Table::GLOBAL_FIELD ; "" ]
Replace Field Contents [ With dialog: Off ; Table::GLOBAL_FIELD ; List ( Table::GLOBAL_FIELD ; Table::PrimaryKey ) ; Skip auto-enter options ]
```

## Restoring a Found Set

There are multiple methods for restoring a found set.

### Old method (relationship-based)

A list of key values stored in a global or record-local text field can drive a relationship (text field -> indexed field) in combination with `Go to Related Record` **(step)**. This can target the same window or a new window. Using a normal text field persists across sessions; using a global text field does not.

### New method (Go to List of Records)

`Go to List of Records` **(step)** restores a found set from a list of record IDs. The IDs can be stored in:

| Storage           | Scope                       | Persists across sessions |
| ----------------- | --------------------------- | ------------------------ |
| `$variable`       | Current script only         | No                       |
| `$$GLOBAL`        | Any script in the session   | No                       |
| Global text field | Any script in the session   | No                       |
| Normal text field | Stored on a specific record | Yes                      |

```
Set Variable [ $ids ; Value: GetRecordIDsFromFoundSet ( 0 ) ]
Go to List of Records [ List of record IDs: $ids ; Using layout: <Current Layout> ; Animation: None ]
```

## Example Snapshot Link XML

The snapshot link includes the record IDs as ranges within the `<Rows>` tag.

```xml
<?xml version="1.0" encoding="utf-8"?>
<FPSL>
  <UIState>
    <UniversalPathList>filemac:/Drive/Users/name/Desktop/Invoice Solution.fmp12
    fmnet:/127.0.0.1/Invoice Solution.fmp12
    fmnet:/127.0.0.1/Invoice Solution.fmp12</UniversalPathList>
    <Rows type="nativeIDList" rowCount="5" baseTableId="134">
<![CDATA[28-30
32-33
]]>
    </Rows>
    <Layout id="34"></Layout>
    <View type="form"></View>
    <SelectedRow type="nativeID" id="28"></SelectedRow>
    <StatusToolbar visible="True"></StatusToolbar>
    <Mode value="browseMode"></Mode>
    <SortList Maintain="True" value="True">
      <Sort type="Ascending">
        <PrimaryField>
          <Field tableId="1065094" table="Invoices" id="35" name="Client Name"></Field>
        </PrimaryField>
      </Sort>
    </SortList>
  </UIState>
</FPSL>
```

**Attribution** Fabrice Nordmann - https://www.youtube.com/watch?v=VP-NWDLs2Tk

## References

| Name                          | Type     | Local doc                                                                  | Claris help                                                                                                     |
| ----------------------------- | -------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Perform Find                  | step     | `agent/docs/filemaker/script-steps/perform-find.md`                        | [perform-find](https://help.claris.com/en/pro-help/content/perform-find.html)                                   |
| Constrain Found Set           | step     | `agent/docs/filemaker/script-steps/constrain-found-set.md`                 | [constrain-found-set](https://help.claris.com/en/pro-help/content/constrain-found-set.html)                     |
| Extend Found Set              | step     | `agent/docs/filemaker/script-steps/extend-found-set.md`                    | [extend-found-set](https://help.claris.com/en/pro-help/content/extend-found-set.html)                           |
| New Window                    | step     | `agent/docs/filemaker/script-steps/new-window.md`                          | [new-window](https://help.claris.com/en/pro-help/content/new-window.html)                                       |
| Loop                          | step     | `agent/docs/filemaker/script-steps/loop.md`                                | [loop](https://help.claris.com/en/pro-help/content/loop.html)                                                   |
| Replace Field Contents        | step     | `agent/docs/filemaker/script-steps/replace-field-contents.md`              | [replace-field-contents](https://help.claris.com/en/pro-help/content/replace-field-contents.html)               |
| Delete All Records            | step     | `agent/docs/filemaker/script-steps/delete-all-records.md`                  | [delete-all-records](https://help.claris.com/en/pro-help/content/delete-all-records.html)                       |
| Check Found Set               | step     | `agent/docs/filemaker/script-steps/check-found-set.md`                     | [check-found-set](https://help.claris.com/en/pro-help/content/check-found-set.html)                             |
| Relookup Field Contents       | step     | `agent/docs/filemaker/script-steps/relookup-field-contents.md`             | [relookup-field-contents](https://help.claris.com/en/pro-help/content/relookup-field-contents.html)             |
| Send Mail                     | step     | `agent/docs/filemaker/script-steps/send-mail.md`                           | [send-mail](https://help.claris.com/en/pro-help/content/send-mail.html)                                         |
| Copy All Records/Requests     | step     | `agent/docs/filemaker/script-steps/copy-all-records-requests.md`           | [copy-all-records-requests](https://help.claris.com/en/pro-help/content/copy-all-records-requests.html)         |
| Import Records                | step     | `agent/docs/filemaker/script-steps/import-records.md`                      | [import-records](https://help.claris.com/en/pro-help/content/import-records.html)                               |
| Export Records                | step     | `agent/docs/filemaker/script-steps/export-records.md`                      | [export-records](https://help.claris.com/en/pro-help/content/export-records.html)                               |
| Save Records as Snapshot Link | step     | `agent/docs/filemaker/script-steps/save-records-as-snapshot-link.md`       | [save-records-as-snapshot-link](https://help.claris.com/en/pro-help/content/save-records-as-snapshot-link.html) |
| Go to Related Record          | step     | `agent/docs/filemaker/script-steps/go-to-related-record.md`                | [go-to-related-record](https://help.claris.com/en/pro-help/content/go-to-related-record.html)                   |
| Go to List of Records         | step     | `agent/docs/filemaker/script-steps/go-to-list-of-records.md`               | [go-to-list-of-records](https://help.claris.com/en/pro-help/content/go-to-list-of-records.html)                 |
| GetSummary                    | function | `agent/docs/filemaker/functions/logical/getsummary.md`                     | [getsummary](https://help.claris.com/en/pro-help/content/getsummary.html)                                       |
| GetNthRecord                  | function | `agent/docs/filemaker/functions/logical/getnthrecord.md`                   | [getnthrecord](https://help.claris.com/en/pro-help/content/getnthrecord.html)                                   |
| GetRecordIDsFromFoundSet      | function | `agent/docs/filemaker/functions/miscellaneous/getrecordidsfromfoundset.md` | [getrecordidsfromfoundset](https://help.claris.com/en/pro-help/content/getrecordidsfromfoundset.html)           |
| While                         | function | `agent/docs/filemaker/functions/logical/while.md`                          | [while](https://help.claris.com/en/pro-help/content/while.html)                                                 |
| List                          | function | `agent/docs/filemaker/functions/aggregate/list.md`                         | [list](https://help.claris.com/en/pro-help/content/list.html)                                                   |
| Get ( FoundCount )            | function | `agent/docs/filemaker/functions/get/get-foundcount.md`                     | [get-foundcount](https://help.claris.com/en/pro-help/content/get-foundcount.html)                               |
