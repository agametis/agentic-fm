# XML Transformation: xml_parsed → fmxmlsnippet

## Overview

`fm_xml_to_snippet.py` converts FileMaker's "Save As XML" export format (stored in `agent/xml_parsed/scripts/`) into the fmxmlsnippet clipboard format (used in `agent/scripts/` and `agent/sandbox/`). These two formats are structurally distinct and not interchangeable — see `SKILL.md` in `.cursor/skills/script-review/` for the full breakdown.

---

## Verification Methodology

Coverage is verified by running the converter against the scripts in `xml_parsed/scripts/` (by line count) and comparing the output line-by-line against a ground-truth fmxmlsnippet copied directly from FileMaker.

### Per-script process

For each script:

1. **Run the converter** against the `xml_parsed` version and capture stderr warnings for unhandled step types.
2. **Copy the fmxmlsnippet** directly from FileMaker and paste it into `agent/scripts/script.xml` as ground truth.
3. **For each unhandled step type**, inspect three sources in parallel:
   - The ground-truth fmxmlsnippet (desired output structure)
   - The `xml_parsed` source (input structure to decode)
   - The canonical snippet example in `agent/snippet_examples/steps/`
4. **Implement a translator function** (`tx_*`) that maps the xml_parsed `ParameterValues` structure to the correct fmxmlsnippet elements.
5. **Add the function** to the `TRANSLATORS` dispatch table.
6. **Re-run the converter** and confirm zero warnings.
7. **Spot-check** key step outputs against the ground truth by line number.

### Key structural mappings discovered

| xml_parsed pattern                                 | fmxmlsnippet pattern                                                 | Notes                |
| -------------------------------------------------- | -------------------------------------------------------------------- | -------------------- |
| `Boolean type="With dialog" value="False"`         | `<NoInteract state="True"/>`                                         | Inverted             |
| `Boolean type="Select" value="True"`               | `<SelectAll state="True"/>`                                          | Direct               |
| `Boolean type="Collapsed"`                         | `<Restore state="..."/>`                                             | Direct               |
| `Boolean type="Verify SSL Certificates"`           | `<VerifySSLCertificates state="..."/>`                               | Direct               |
| `Boolean type="In external browser"`               | `<Option state="..."/>` (Open URL)                                   | Direct               |
| `Boolean type="Skip auto-enter options"`           | `PerformAutoEnter="..."`                                             | Direct (same value)  |
| `Options ShowRelated="True"` (GTRR)                | `<Option state="False"/>`                                            | Inverted             |
| `URL autoEncode="True"`                            | `<DontEncodeURL state="False"/>`                                     | Inverted             |
| `Parameter type="Target" > Variable value="$x"`    | `<Field>$x</Field>`                                                  | Variable target      |
| `Parameter type="Target" > FieldReference`         | `<Field table="" id="" name=""/>`                                    | Field target         |
| `LayoutReferenceContainer Label="original layout"` | `<LayoutDestination value="CurrentLayout"/>` (no `<Layout>` element) |                      |
| `Animation name="Cross Dissolve"`                  | `<Animation value="CrossDissolve"/>`                                 | Strip spaces         |
| `Location` CDATA (Get File Exists)                 | `<UniversalPathList>path</UniversalPathList>`                        | Raw text, not nested |
| `Text value="..."` (Insert Text)                   | `<Text>...</Text>` with `\r` → `&#xD;`                               | CR entity encoding   |

---

## Step Coverage Table

✅ = handled by `fm_xml_to_snippet.py` &nbsp;&nbsp; ⬜ = not yet implemented (emits TODO comment + warning)

### accounts

| Step                   | Covered |
| ---------------------- | ------- |
| Add Account            | ⬜      |
| Change Password        | ⬜      |
| Delete Account         | ⬜      |
| Enable Account         | ⬜      |
| Re-Login               | ⬜      |
| Reset Account Password | ⬜      |

### artificial intelligence

| Step                                  | Covered |
| ------------------------------------- | ------- |
| Configure AI Account                  | ⬜      |
| Configure Machine Learning Model      | ⬜      |
| Configure Prompt Template             | ⬜      |
| Configure RAG Account                 | ⬜      |
| Configure Regression Model            | ⬜      |
| Fine-Tune Model                       | ⬜      |
| Generate Response from Model          | ⬜      |
| Insert Embedding in Found Set         | ⬜      |
| Insert Embedding                      | ⬜      |
| Perform Find by Natural Language      | ⬜      |
| Perform RAG Action                    | ⬜      |
| Perform SQL Query by Natural Language | ⬜      |
| Perform Semantic Find                 | ⬜      |
| Set AI Call Logging                   | ⬜      |

### control

| Step                                   | Covered |
| -------------------------------------- | ------- |
| Allow User Abort                       | ✅      |
| Commit Transaction                     | ⬜      |
| Configure Local Notification           | ⬜      |
| Configure NFC Reading                  | ⬜      |
| Configure Region Monitor Script        | ⬜      |
| Else If                                | ✅      |
| Else                                   | ✅      |
| End If                                 | ✅      |
| End Loop                               | ✅      |
| Exit Loop If                           | ✅      |
| Exit Script                            | ✅      |
| Halt Script                            | ⬜      |
| If                                     | ✅      |
| Install OnTimer Script                 | ⬜      |
| Loop                                   | ✅      |
| Open Transaction                       | ⬜      |
| Pause/Resume Script                    | ✅      |
| Perform Script on Server with Callback | ⬜      |
| Perform Script on Server               | ⬜      |
| Perform Script                         | ✅      |
| Revert Transaction                     | ⬜      |
| Set Error Capture                      | ✅      |
| Set Error Logging                      | ⬜      |
| Set Layout Object Animation            | ✅      |
| Set Revert Transaction on Error        | ⬜      |
| Set Variable                           | ✅      |
| Trigger Claris Connect Flow            | ⬜      |

### editing

| Step                 | Covered |
| -------------------- | ------- |
| Clear                | ⬜      |
| Copy                 | ⬜      |
| Cut                  | ⬜      |
| Paste                | ⬜      |
| Perform Find-Replace | ⬜      |
| Select All           | ⬜      |
| Set Selection        | ⬜      |
| Undo/Redo            | ⬜      |

### fields

| Step                     | Covered |
| ------------------------ | ------- |
| Export Field Contents    | ⬜      |
| Insert Audio/Video       | ⬜      |
| Insert Calculated Result | ✅      |
| Insert Current Date      | ⬜      |
| Insert Current Time      | ⬜      |
| Insert Current User Name | ⬜      |
| Insert File              | ✅      |
| Insert PDF               | ⬜      |
| Insert Picture           | ⬜      |
| Insert Text              | ✅      |
| Insert from Device       | ⬜      |
| Insert from Index        | ⬜      |
| Insert from Last Visited | ⬜      |
| Insert from URL          | ✅      |
| Relookup Field Contents  | ⬜      |
| Replace Field Contents   | ✅      |
| Set Field By Name        | ✅      |
| Set Field                | ✅      |
| Set Next Serial Value    | ⬜      |

### files

| Step                   | Covered |
| ---------------------- | ------- |
| Close Data File        | ✅      |
| Close File             | ⬜      |
| Convert File           | ⬜      |
| Create Data File       | ✅      |
| Delete File            | ✅      |
| Get Data File Position | ⬜      |
| Get File Exists        | ✅      |
| Get File Size          | ✅      |
| New File               | ⬜      |
| Open Data File         | ✅      |
| Open File              | ⬜      |
| Print Setup            | ⬜      |
| Print                  | ⬜      |
| Read from Data File    | ⬜      |
| Recover File           | ⬜      |
| Rename File            | ⬜      |
| Save a Copy as XML     | ⬜      |
| Save a Copy as         | ⬜      |
| Set Data File Position | ⬜      |
| Set Multi-User         | ⬜      |
| Set Use System Formats | ⬜      |
| Write to Data File     | ✅      |

### found sets

| Step                  | Covered |
| --------------------- | ------- |
| Constrain Found Set   | ✅      |
| Extend Found Set      | ✅      |
| Find Matching Records | ⬜      |
| Modify Last Find      | ⬜      |
| Omit Multiple Records | ⬜      |
| Omit Record           | ✅      |
| Perform Find          | ✅      |
| Perform Quick Find    | ⬜      |
| Show All Records      | ⬜      |
| Show Omitted Only     | ⬜      |
| Sort Records by Field | ⬜      |
| Sort Records          | ✅      |
| Unsort Records        | ⬜      |

### miscellaneous

| Step                             | Covered |
| -------------------------------- | ------- |
| # (comment)                      | ✅      |
| AVPlayer Play                    | ⬜      |
| AVPlayer Set Options             | ⬜      |
| AVPlayer Set Playback State      | ⬜      |
| Allow Formatting Bar             | ⬜      |
| Beep                             | ⬜      |
| Dial Phone                       | ⬜      |
| Enable Touch Keyboard            | ⬜      |
| Execute FileMaker Data API       | ⬜      |
| Execute SQL                      | ⬜      |
| Exit Application                 | ⬜      |
| Flush Cache to Disk              | ⬜      |
| Get Folder Path                  | ⬜      |
| Install Menu Set                 | ⬜      |
| Install Plug-In File             | ⬜      |
| Open URL                         | ✅      |
| Perform AppleScript              | ⬜      |
| Perform JavaScript in Web Viewer | ✅      |
| Refresh Object                   | ✅      |
| Refresh Portal                   | ✅      |
| Save a Copy as Add-on Package    | ⬜      |
| Send DDE Execute                 | ⬜      |
| Send Event                       | ⬜      |
| Send Mail                        | ⬜      |
| Set Session Identifier           | ⬜      |
| Set Web Viewer                   | ✅      |
| Show Custom Dialog               | ✅      |
| Speak                            | ⬜      |

### navigation

| Step                      | Covered |
| ------------------------- | ------- |
| Close Popover             | ⬜      |
| Enter Browse Mode         | ⬜      |
| Enter Find Mode           | ✅      |
| Enter Preview Mode        | ⬜      |
| Go to Field               | ⬜      |
| Go to Layout              | ✅      |
| Go to List of Records     | ⬜      |
| Go to Next Field          | ⬜      |
| Go to Object              | ✅      |
| Go to Portal Row          | ⬜      |
| Go to Previous Field      | ⬜      |
| Go to Record/Request/Page | ⬜      |
| Go to Related Record      | ✅      |

### open menu item

| Step                     | Covered |
| ------------------------ | ------- |
| Open Edit Saved Finds    | ⬜      |
| Open Favorites           | ⬜      |
| Open File Options        | ⬜      |
| Open Find/Replace        | ⬜      |
| Open Help                | ⬜      |
| Open Hosts               | ⬜      |
| Open Manage Containers   | ⬜      |
| Open Manage Data Sources | ⬜      |
| Open Manage Database     | ⬜      |
| Open Manage Layouts      | ⬜      |
| Open Manage Themes       | ⬜      |
| Open Manage Value Lists  | ⬜      |
| Open Script Workspace    | ⬜      |
| Open Settings            | ⬜      |
| Open Sharing             | ⬜      |
| Open Upload to Host      | ⬜      |

### records

| Step                          | Covered |
| ----------------------------- | ------- |
| Commit Records/Requests       | ✅      |
| Copy All Records/Requests     | ⬜      |
| Copy Record/Request           | ⬜      |
| Delete All Records            | ⬜      |
| Delete Portal Row             | ⬜      |
| Delete Record/Request         | ⬜      |
| Duplicate Record/Request      | ⬜      |
| Export Records                | ⬜      |
| Import Records                | ⬜      |
| New Record/Request            | ✅      |
| Open Record/Request           | ⬜      |
| Revert Record/Request         | ⬜      |
| Save Records as Excel         | ⬜      |
| Save Records as JSONL         | ⬜      |
| Save Records as PDF           | ⬜      |
| Save Records as Snapshot Link | ⬜      |
| Truncate Table                | ⬜      |

### spelling

| Step                 | Covered |
| -------------------- | ------- |
| Check Found Set      | ⬜      |
| Check Record         | ⬜      |
| Check Selection      | ⬜      |
| Correct Word         | ⬜      |
| Edit User Dictionary | ⬜      |
| Select Dictionaries  | ⬜      |
| Set Dictionary       | ⬜      |
| Spelling Options     | ⬜      |

### windows

| Step                 | Covered |
| -------------------- | ------- |
| Adjust Window        | ⬜      |
| Arrange All Windows  | ⬜      |
| Close Window         | ✅      |
| Freeze Window        | ✅      |
| Move/Resize Window   | ⬜      |
| New Window           | ⬜      |
| Refresh Window       | ⬜      |
| Scroll Window        | ⬜      |
| Select Window        | ⬜      |
| Set Window Title     | ⬜      |
| Set Zoom Level       | ⬜      |
| Show/Hide Menubar    | ⬜      |
| Show/Hide Text Ruler | ⬜      |
| Show/Hide Toolbars   | ⬜      |
| View As              | ⬜      |

---

## Coverage Summary

| Category                | Covered | Total   | %       |
| ----------------------- | ------- | ------- | ------- |
| accounts                | 0       | 6       | 0%      |
| artificial intelligence | 0       | 14      | 0%      |
| control                 | 14      | 27      | 52%     |
| editing                 | 0       | 8       | 0%      |
| fields                  | 7       | 19      | 37%     |
| files                   | 7       | 22      | 32%     |
| found sets              | 5       | 13      | 38%     |
| miscellaneous           | 7       | 28      | 25%     |
| navigation              | 4       | 13      | 31%     |
| open menu item          | 0       | 16      | 0%      |
| records                 | 2       | 17      | 12%     |
| spelling                | 0       | 8       | 0%      |
| windows                 | 2       | 15      | 13%     |
| **Total**               | **48**  | **206** | **23%** |

> Control is the strongest category because the core flow-control steps (`If`, `Loop`, `Exit`, `Set Variable`, `Perform Script`) appear in virtually every script, ensuring they were implemented first. Coverage of other categories will expand as additional scripts are tested.
