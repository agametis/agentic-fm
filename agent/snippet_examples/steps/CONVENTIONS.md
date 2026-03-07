# Snippet Examples Conventions

This document defines the conventions for authoring and maintaining snippet_examples XML files. Every file in this directory is a canonical template that AI agents copy verbatim when generating fmxmlsnippet output, so consistency and clarity are critical.

## File structure

Every snippet file follows this layout:

```xml
<?xml version="1.0"?>
<fmxmlsnippet type="FMObjectList">
  <Step enable="True" id="0" name="Step Name">
    <!-- child elements with realistic default values -->
  </Step>
</fmxmlsnippet>
<!-- XML comments with guidance (enumerations, required/optional, paired steps, docs) -->
```

The file has two zones:

1. **Template zone** -- everything inside `<fmxmlsnippet>`. This is the copy-paste template. It must contain only valid fmxmlsnippet XML with realistic default values. AI agents copy this structure exactly and substitute IDs and values.
2. **Comment zone** -- XML comments after the closing `</fmxmlsnippet>` tag. This is where all human-readable guidance lives: enumerations, required/optional indicators, paired step notes, and documentation links. AI agents read these for context but never include them in output.

## Template zone rules

### Step attributes

Every `<Step>` element must have three attributes:

- `enable="True"` -- always True in templates
- `id="0"` -- always 0; FileMaker auto-assigns on paste
- `name="Step Name"` -- the exact FileMaker script step name

### CDATA values

CDATA sections inside `<Calculation>` elements must contain **realistic default values**, not documentation text.

Good -- realistic defaults:

```xml
<Calculation><![CDATA[30]]></Calculation>
<Calculation><![CDATA[""]]></Calculation>
<Calculation><![CDATA[$scriptParameter]]></Calculation>
<Calculation><![CDATA[Get ( LastError )]]></Calculation>
```

Good -- realistic default with a FileMaker calc comment for context:

```xml
<Calculation><![CDATA[1 // Number of seconds]]></Calculation>
<Calculation><![CDATA[0 // Error code]]></Calculation>
```

Bad -- documentation string masquerading as a value:

```xml
<Calculation><![CDATA["(optional) specifies a script parameter for the script."]]></Calculation>
```

The `// comment` syntax is a valid FileMaker calculation comment, so it is safe to include for clarity. It helps the AI understand the expected data type and purpose without being confused for an actual value.

### Enumeration attributes

When an XML attribute accepts one of a fixed set of values, the template must contain **one concrete value** -- the most common or sensible default.

Good:

```xml
<Action value="Read">
```

Bad -- multiple values joined with a pipe:

```xml
<Action value="Read|Cancel">
```

The full set of valid values is documented in the comment zone (see below).

### Boolean state attributes

Elements like `<Set>`, `<Option>`, `<Restore>`, `<Pause>`, and similar use `state="True"` or `state="False"`. The template should show the most common default.

```xml
<Set state="False"/>
<Option state="False"/>
<Restore state="False"/>
```

### Reference elements

Elements that reference FileMaker objects (fields, layouts, scripts, tables) use `id` and `name` attributes. Templates should use `id="0"` and `name=""` to signal that these must be populated from CONTEXT.json.

```xml
<Script id="0" name=""/>
<Field table="" id="0" name=""/>
<Layout id="0" name=""/>
<Table id="0" name=""/>
```

### Optional child elements

If a child element is optional, include it in the template with a realistic default value. Document it as optional in the comment zone. This way the AI sees the correct structure if it needs to use the element, but knows from the comment that it can be omitted.

If omitting the element is the overwhelmingly common case, it is acceptable to leave it out of the template entirely and document it only in the comment zone. Use judgment: if the structure is non-obvious, include it.

## Comment zone rules

All guidance lives in XML comments placed **after** the closing `</fmxmlsnippet>` tag. Comments inside the template zone are not permitted (AI agents are instructed to exclude XML comments from output, but keeping the template zone clean avoids any ambiguity).

### Enumerations

Document every attribute that accepts a fixed set of values. Use quoted values separated by ` | `.

```xml
<!-- Action value: "Read" | "Cancel" -->
<!-- LayoutDestination value: "CurrentLayout" | "SelectedLayout" | "OriginalLayout" | "LayoutByNumber" -->
<!-- Style: "Document" | "Floating Document" | "Card" -->
```

### Required and optional elements

When a step has a mix of required and optional child elements, list them explicitly.

```xml
<!-- Required: Name, Delay, Title, Body. -->
<!-- Optional: Button1Label, Button2Label, Button3Label, Button1ForceFgnd, Button2ForceFgnd, Button3ForceFgnd, ShowWhenAppInForeground. -->
```

### Paired steps

When a step must appear with a matching counterpart, note it.

```xml
<!-- Requires a matching End If step. -->
<!-- Requires a matching Commit Transaction step. -->
<!-- Requires a matching End Loop step. -->
```

### Boolean state hints

When a boolean attribute's meaning is not obvious from the element name, explain both states.

```xml
<!-- Set state: "True" allows user abort. "False" prevents user abort. -->
<!-- NoInteract state: "True" suppresses dialog. "False" shows dialog. -->
```

### Documentation links

When a step has detailed documentation on the Claris help site, include the link.

```xml
<!-- See https://help.claris.com/en/pro-help/content/configure-local-notification.html -->
```

### Comment ordering

When a step has multiple comment types, use this order:

1. Enumeration values
2. Required/optional elements
3. Boolean state hints
4. Paired step notes
5. Documentation links

## Examples

### Minimal step (no parameters)

```xml
<?xml version="1.0"?>
<fmxmlsnippet type="FMObjectList">
  <Step enable="True" id="0" name="Close Window"/>
</fmxmlsnippet>
```

### Boolean-only step

```xml
<?xml version="1.0"?>
<fmxmlsnippet type="FMObjectList">
  <Step enable="True" id="0" name="Allow User Abort">
    <Set state="False"/>
  </Step>
</fmxmlsnippet>
<!-- Set state: "True" allows user abort. "False" prevents user abort. -->
```

### Step with enumerations, optional elements, and a paired step

```xml
<?xml version="1.0"?>
<fmxmlsnippet type="FMObjectList">
  <Step enable="True" id="0" name="Configure NFC Reading">
    <Calculation><![CDATA[$scriptParameter]]></Calculation>
    <Script id="0" name=""/>
    <Action value="Read">
      <Timeout>
        <Calculation><![CDATA[30]]></Calculation>
      </Timeout>
      <ReadMultiple>
        <Calculation><![CDATA[0]]></Calculation>
      </ReadMultiple>
      <JSONOutput>
        <Calculation><![CDATA[1]]></Calculation>
      </JSONOutput>
    </Action>
  </Step>
</fmxmlsnippet>
<!-- Action value: "Read" | "Cancel". Cancel cancels a pending Read operation. -->
<!-- Optional: Timeout (seconds before auto-cancel), ReadMultiple (non-zero reads continuously), JSONOutput (non-zero returns JSON instead of multiline string). -->
<!-- Script parameter Calculation is optional. -->
```

### Step with required/optional split and a docs link

```xml
<?xml version="1.0"?>
<fmxmlsnippet type="FMObjectList">
  <Step enable="True" id="0" name="Configure Local Notification">
    <Script id="0" name=""/>
    <Action value="Queue">
      <Name>
        <Calculation><![CDATA["notification name"]]></Calculation>
      </Name>
      <Delay>
        <Calculation><![CDATA[1 // Number of seconds]]></Calculation>
      </Delay>
      <Title>
        <Calculation><![CDATA["title"]]></Calculation>
      </Title>
      <Body>
        <Calculation><![CDATA["body"]]></Calculation>
      </Body>
    </Action>
  </Step>
</fmxmlsnippet>
<!-- Action value: "Queue" | "Clear". -->
<!-- Required: Name, Delay, Title, Body. -->
<!-- Optional: Button1Label, Button2Label, Button3Label, Button1ForceFgnd, Button2ForceFgnd, Button3ForceFgnd, ShowWhenAppInForeground. -->
<!-- See https://help.claris.com/en/pro-help/content/configure-local-notification.html -->
```

## Checklist for adding or updating a snippet

1. Template zone contains only valid fmxmlsnippet XML.
2. `id="0"` on the `<Step>` element.
3. CDATA values are realistic defaults, not documentation text.
4. Enumeration attributes show one concrete value (the most common default).
5. Reference elements use `id="0" name=""`.
6. All guidance is in XML comments after `</fmxmlsnippet>`.
7. Enumerations, required/optional, boolean hints, paired steps, and doc links are documented.
