# Found Sets

**NOTE:** Inline code such as `Constrain Found Set` indicate either valid script steps or calculation functions.

## Attributes of Found Sets

- A Found Set is a list of specific records.
- `Perform Find` can create a found set or empty set.
- New records from any client are not added to any other client's Found Set.
- Record deletions do impact the found set for all clients.
- `Constrain Found Set` & `Extend Found Set` preserve any applied sort order.
- A zero found, set based on `Perform Find` removes the previous sort order.
- A `New Window` created by the script step will retain the same found set and sort order.

## Actionable things that can be done to a Found Set

- `Loop` through records.
- Apply `Replace Field Contents` to all records.
- `Delete All Records` does what it says either with or without a prompt.
- Check the spelling in all fields of all records using `Check Found Set`.
- Using `Relookup Field Contents` uses the lookup specified on a relationship.
- The `Send Mail` scipt step has an option titled "Multiple emails (one for each record in found set)"
- The `GetSummary ( summaryField ; breakField )` can be used on fields in the found set.
- The `GetNthRecord ( field ; recordNumber )` can be used against the found set using either a `Loop` or `While ( [ initialVariable ] ; condition ; [ logic ] ; result )`
- `Copy All Records/Requests` will copy the data to the clipboard as tab delimited data from all fields shown on the layout for the current found set.
- The `Import Records` script step has and options of Update or Replace which will work only on the found set.
- The `Export Records` script step can export the found set.
- `GetRecordIDsFromFoundSet ( type )` will retrieve the internal record id in a variety of formats for the found set.
- The `Save Records as Snapshot Link` step when using _Records being browsed_ will output an xml file to any path (see example below)

## Methods of getting a list of values from any indexed fields of the Found Set

- If the table has a Summary field using the **ListOf** type the `GetSummary ( summaryField ; breakField )` function can be used.
- A record `Loop` can be used to collect field values into a $variable or field.
- If a global text field is the target of `Replace Field Contents` step with a calculation the function of `List ( Table::GLOBALFIELD ; Table::FieldName )` will concatenate the values together as a return delimited list of values.

## Restoring a Found Set

There are multiple methods for restoring a found set.

- **Old method:** A list of key values, stored within a global text field can use a relationship (global text field -> indexed field of most any type) in combination with the `Go to Related Record` script step. This can be within the same window or a new target window.
- **New method:** The new method of restoring a found set, but only for the current session (e.g. it does not persist when the client logs out of a solution) is the following. The storage of the values can be
  - a $variable for use within the same script
  - a $$GLOBAL variable for use across multiple scripts
  - a normal text field
  - a global text field

```
Set Variable [ $ids ; Value: GetRecordIDsFromFoundSet ( 0 ) ]
Go to List of Records [ List of record IDs: $ids ; Using layout: <Current Layout> ; Animation: None ]
```

## Example Snapshot Link XML

The snapshot link does include the record id of ranges of records within the <Rows> tag.

```
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
