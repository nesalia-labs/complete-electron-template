# GitHub Issue Form Templates

Issue form templates are YAML files placed in `.github/ISSUE_TEMPLATE/` that provide structured forms when contributors create issues.

## Top-level Keys

| Key | Required | Type | Description |
|-----|----------|------|-------------|
| `name` | Yes | String | Template name (unique among all templates) |
| `description` | Yes | String | Shown in template chooser |
| `title` | No | String | Pre-populated title with prefix pattern |
| `labels` | No | Array | Auto-added labels (must exist in repo) |
| `assignees` | No | Array | Auto-assigned users |
| `projects` | No | Array | Format: `owner/number` |
| `body` | Yes | Array | Form input definitions |

## Input Types

| Type | Description | Key Attributes |
|------|-------------|----------------|
| `markdown` | Static text (not submitted) | `value` |
| `textarea` | Multi-line text field | `label`, `description`, `placeholder`, `value`, `render` |
| `input` | Single-line text field | `label`, `description`, `placeholder`, `value` |
| `dropdown` | Dropdown menu | `label`, `options`, `multiple`, `default` |
| `checkboxes` | Checkbox set | `label`, `options` |
| `upload` | File upload | `label`, `accept` (extensions) |

## Project Label Taxonomy

This project uses structured labels. Issue templates should encourage their use:

```
Type:    type: bug | type: feature | type: refactor | type: docs | type: security
Status:  status: triage | status: ready | status: in-progress | status: in-review
Priority: p0: critical | p1: high | p2: medium | p3: low
Effort:  effort: xs | effort: s | effort: m | effort: l
```

## Minimal Bug Report Template

```yaml
name: "\U0001F41E Bug Report"
description: File a bug report to help us improve
title: "[Bug]: "
labels: ["bug", "status: triage"]
body:
  - type: checkboxes
    attributes:
      label: Is there an existing issue?
      description: Please search to see if the bug already exists.
      options:
        - label: I have searched the existing issues
          required: true
  - type: textarea
    id: what-happened
    attributes:
      label: What happened?
      description: Describe the bug in detail
      placeholder: Tell us what you see!
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: Expected behavior
      description: What did you expect to happen?
    validations:
      required: false
  - type: textarea
    id: steps
    attributes:
      label: Steps to reproduce
      description: How to reproduce the bug
      placeholder: |
        1. Go to '...'
        2. Click on '...'
        3. See error
      render: bash
    validations:
      required: false
  - type: input
    id: version
    attributes:
      label: Version
      description: What version of the software are you running?
      placeholder: e.g., 1.0.0
    validations:
      required: false
  - type: upload
    id: screenshots
    attributes:
      label: Screenshots
      description: Drag and drop or attach relevant screenshots
    validations:
      required: false
      accept: ".png,.jpg,.gif"
```

## Feature Request Template

```yaml
name: "\U0001F31F Feature Request"
description: Suggest a new feature or enhancement
title: "[Feature]: "
labels: ["type: feature", "status: triage"]
body:
  - type: textarea
    id: problem
    attributes:
      label: Problem solved
      description: Describe the problem this feature would solve
      placeholder: "I struggle with..."
    validations:
      required: true
  - type: textarea
    id: solution
    attributes:
      label: Proposed solution
      description: How should this feature work?
      placeholder: "This could be solved by..."
    validations:
      required: true
  - type: textarea
    id: alternatives
    attributes:
      label: Alternatives considered
      description: Any alternative solutions you've considered?
    validations:
      required: false
  - type: checkboxes
    attributes:
      label: Is this blocking your work?
      options:
        - label: Yes, I cannot proceed without this
        - label: No, it's an enhancement
    validations:
      required: false
```

## Render Modes for textarea

The `render` key formats submitted text as a code block:

| Value | Format |
|-------|--------|
| `bash` | Bash/script output |
| `shell` | Shell commands |
| `markdown` | Markdown |
| (omitted) | Plain text |

## Validation

Use `validations.required: true` to make a field mandatory. Only works for public repositories.

## File Location

Place templates in `.github/ISSUE_TEMPLATE/` with `.yml` extension. GitHub automatically presents them in the issue chooser.

```
.github/
└── ISSUE_TEMPLATE/
    ├── bug_report.yml
    └── feature_request.yml
```

## Reference

- [Issue forms syntax](https://docs.github.com/en/communities/using-templates-to-encourage-useful-contributions/syntax-for-issue-forms)
- [Form schema](https://docs.github.com/en/communities/using-templates-to-encourage-useful-contributions/syntax-for-gitHub-s-form-schema)

---

## Améliorations pour le niveau "Staff" (Pro Tips)

Pour des projets de très grande envergure, voici les détails qui rendront vos templates encore plus robustes :

### 🔒 Sécurité (Alerte Critique)

Un template senior **doit** mentionner la sécurité explicitement :

```yaml
- type: markdown
  attributes:
    value: |
      ## ⚠️ Security Issue?

      If this is a **security vulnerability**, do NOT post here publicly.
      Email us at: security@yourcompany.com

      For more info, see our [SECURITY.md](./SECURITY.md)
```

### 🛡️ Validation des logs (PII Warning)

Dans la section logs, ajouter un rappel pour éviter les fuites de données :

```yaml
- type: textarea
  id: logs
  attributes:
    label: Logs / Stack trace
    description: |
      Please remove any **PII (Personally Identifiable Information)** or
      **secrets/tokens** before pasting logs.

      Examples of PII to remove:
      - Email addresses
      - API keys / tokens
      - Personal names
      - IPs (yours and others)
    placeholder: |
      Paste your logs here...
      # REMINDER: Remove PII before submitting!
  validations:
    required: false
```

### 🔧 Diagnostic Automatique (Electron App)

Pour une app Electron, il est souvent utile de demander des infos de diagnostic :

```yaml
- type: textarea
  id: diagnostic
  attributes:
    label: Environment Diagnostic
    description: |
      Run these commands in your terminal to gather environment info:

      ```bash
      # Electron version info
      node -p "process.versions"

      # Or for the full Electron info
      node -p "JSON.stringify(process.versions, null, 2)"
      ```
    placeholder: |
      Paste the output of `node -p "process.versions"` here
  validations:
    required: false
```

### 🧪 Lien avec les tests (TDD/Bug Reproduction)

Encouragez le TDD et la reproduction de bugs par le code :

```yaml
- type: checkboxes
  attributes:
    label: Test Coverage
    options:
      - label: "There is a failing test that reproduces this bug"
      - label: "I can provide a minimal reproduction case"
      - label: "No existing test coverage for this area"
```

### 📋 Checklist de soumission finale

```yaml
- type: checkboxes
  attributes:
    label: Pre-Submission Checklist
    options:
      - label: I have searched existing issues
      - label: I have removed all PII from logs
      - label: Steps to reproduce are clear
      - label: Environment info is provided
      - label: This is not a security vulnerability (see above)
```

---

## Template Bug Report Complet (Niveau Staff)

```yaml
name: "🐛 Bug Report (Staff Level)"
description: Report a bug with full diagnostic information
title: "[Bug]: "
labels: ["type: bug", "status: triage"]

body:
  - type: markdown
    attributes:
      value: |
        ## ⚠️ Security Issue?

        If this is a **security vulnerability**, do NOT post here.
        Email: security@yourcompany.com

  - type: textarea
    id: description
    attributes:
      label: Bug Summary
      description: Clear and concise description of the bug
      placeholder: "What happens? What's the impact?"
    validations:
      required: true

  - type: dropdown
    id: priority
    attributes:
      label: Priority
      options:
        - p0: critical (Tout s'arrête)
        - p1: high (Prochaine release)
        - p2: medium (Normal)
        - p3: low (Nice to have)
      default: p2: medium

  - type: textarea
    id: reproduction
    attributes:
      label: Steps to Reproduce
      description: Detailed steps to reproduce the bug
      placeholder: |
        1. Go to '...'
        2. Click on '...'
        3. See error
      render: bash
    validations:
      required: true

  - type: textarea
    id: expected
    attributes:
      label: Expected Behavior
    validations:
      required: true

  - type: textarea
    id: actual
    attributes:
      label: Actual Behavior
    validations:
      required: true

  - type: textarea
    id: environment
    attributes:
      label: Environment Diagnostic
      description: |
        Run this command and paste the output:

        ```bash
        node -p "process.versions"
        ```
      placeholder: |
        Paste output of `node -p "process.versions"`

  - type: textarea
    id: logs
    attributes:
      label: Logs / Stack Trace
      description: |
        **REMINDER**: Remove all PII (emails, names, IPs, tokens) before pasting.
    validations:
      required: false

  - type: checkboxes
    attributes:
      label: Test Coverage
      options:
        - label: "Failing test case exists and can be provided"
        - label: "Minimal reproduction case available"
        - label: "No test coverage for this area"

  - type: checkboxes
    attributes:
      label: Pre-Submission Checklist
      options:
        - label: I have searched existing issues
        - label: All PII removed from logs
        - label: Steps are clear
        - label: Environment info provided
        - label: This is NOT a security vulnerability
```

---

## Common Validation Errors

When creating, saving, or viewing issue forms, you may encounter these common validation errors:

### Required top level key `name` is missing

The template does not contain a `name` field.

```yaml
# Wrong
description: "Thank you for reporting a bug!"

# Correct
name: "Bug report"
description: "Thank you for reporting a bug!"
```

### `key` must be a string

A permitted key has a value that cannot be parsed as the expected data type.

```yaml
# Wrong - description parsed as Boolean
description: true

# Correct - string value
description: "Thank you for reporting a bug!"
```

Empty strings or whitespace-only strings are also not permissible:

```yaml
# Wrong
name: ""
description: "File a bug report"
assignees: "      "

# Correct
name: "Bug Report"
description: "File a bug report"
```

### `input` is not a permitted key

An unexpected key was supplied at the top level.

```yaml
# Wrong
name: "Bug report"
hello: world

# Correct - remove unexpected keys
name: "Bug report"
```

### Forbidden keys

YAML parses certain strings as Boolean values. The following keys are forbidden:

```
y, Y, yes, Yes, YES, n, N, no, No, NO, 
true, True, TRUE, false, False, FALSE, 
on, On, ON, off, Off, OFF
```

### Body must contain at least one non-markdown field

Issue forms must accept user input. A body array cannot contain only markdown elements.

```yaml
# Wrong
body:
- type: markdown
  attributes:
    value: "Bugs are the worst!"

# Correct - add user input field
body:
- type: markdown
  attributes:
    value: "Bugs are the worst!"
- type: textarea
  attributes:
    label: "What's wrong?"
```

### Body must have unique ids

Each `id` attribute must be unique when using `id` to distinguish elements.

```yaml
# Wrong
body:
- type: input
  id: name
  attributes:
    label: First name
- type: input
  id: name
  attributes:
    label: Last name

# Correct - unique ids
body:
- type: input
  id: first-name
  attributes:
    label: First name
- type: input
  id: last-name
  attributes:
    label: Last name
```

### Body must have unique labels

Each user input field's `label` attribute must be unique.

```yaml
# Wrong
body:
- type: textarea
  attributes:
    label: Name
- type: textarea
  attributes:
    label: Name

# Correct - distinct labels
body:
- type: textarea
  attributes:
    label: First name
- type: textarea
  attributes:
    label: Last name
```

Or use `id` to differentiate fields with identical labels:

```yaml
body:
- type: textarea
  id: name_1
  attributes:
    label: Name
- type: textarea
  id: name_2
  attributes:
    label: Name
```

### Labels are too similar

Two labels may be processed into the same parameterized string.

```yaml
# Wrong
body:
- type: input
  attributes:
    label: Name?
- type: input
  id: name
  attributes:
    label: Name???????

# Correct - add differentiating characters
body:
- type: input
  attributes:
    label: Name?
- type: input
  attributes:
    label: Your name
```

### Checkboxes must have unique labels

Each nested checkbox label must be unique among peers and other input types.

```yaml
# Wrong
body:
- type: textarea
  attributes:
    label: Name
- type: checkboxes
  attributes:
    options:
    - label: Name

# Correct
body:
- type: textarea
  attributes:
    label: Name
- type: checkboxes
  attributes:
    options:
    - label: Your name
```

### `body[i]: required key type is missing`

Each body block must contain the `type` key. Errors are prefixed with `body[i]` where `i` is the zero-indexed position.

```yaml
# Wrong
body:
- attributes:
    value: "Thanks for taking the time to fill out this bug!"

# Correct
body:
- type: markdown
  attributes:
    value: "Thanks for taking the time to fill out this bug!"
```

### `body[i]: x is not a valid input type`

The `type` value is not one of the permitted types.

```yaml
# Wrong
body:
- type: x
  attributes:
    value: "Hello"

# Correct
body:
- type: markdown
  attributes:
    value: "Hello"
```

### `body[i]: required attribute key value is missing`

A required value attribute has not been provided.

```yaml
# Wrong
body:
- type: markdown
  attributes:
    value: "Hello"
- type: markdown

# Correct
body:
- type: markdown
  attributes:
    value: "Hello"
- type: markdown
  attributes:
    value: "This is working now!"
```

### `body[i]: label must be a string`

The label is being parsed as a Boolean instead of a string.

```yaml
# Wrong
body:
- type: textarea
  attributes:
    label: true

# Correct - wrap in quotes if value might be parsed as Boolean
body:
- type: textarea
  attributes:
    label: "true"
```

### `body[i]: id can only contain numbers, letters, -, _`

The `id` contains non-permitted characters like whitespace.

```yaml
# Wrong
body:
- type: input
  id: first name
  attributes:
    label: First name

# Correct
body:
- type: input
  id: first-name
  attributes:
    label: First name
```

### `body[i]: x is not a permitted key`

An unexpected key was provided at the same level as `type` and `attributes`.

```yaml
# Wrong
body:
- type: markdown
  x: woof
  attributes:
    value: "Hello"

# Correct
body:
- type: markdown
  attributes:
    value: "Hello"
```

### `body[i]: label contains forbidden word`

Some words commonly used by attackers are not permitted in labels (e.g., "password").

```yaml
# Wrong
body:
- type: input
  attributes:
    label: Password

# Correct
body:
- type: input
  attributes:
    label: Username
```

### `body[i]: x is not a permitted attribute`

An invalid key was supplied in an `attributes` block.

```yaml
# Wrong
body:
- type: markdown
  attributes:
    x: "a random key!"
    value: "Hello"

# Correct
body:
- type: markdown
  attributes:
    value: "Hello"
```

### `body[i]: options must be unique`

For checkboxes and dropdown, choices in the `options` array must be unique.

```yaml
# Wrong
body:
- type: dropdown
  attributes:
    label: Favorite dessert
    options:
      - ice cream
      - ice cream
      - pie

# Correct
body:
- type: dropdown
  attributes:
    label: Favorite dessert
    options:
      - ice cream
      - pie
```

### `body[i]: options must not include the reserved word, none`

"None" is reserved to indicate non-choice when a dropdown is not required.

```yaml
# Wrong
body:
- type: dropdown
  attributes:
    label: What types of pie do you like?
    options:
      - Steak & Ale
      - Chicken & Leek
      - None

# Correct - "None" will be auto-populated as a selectable option
body:
- type: dropdown
  attributes:
    label: What types of pie do you like?
    options:
      - Steak & Ale
      - Chicken & Leek
```

### `body[i]: options must not include booleans`

Words like `yes`, `no`, `true` are parsed as Booleans unless wrapped in quotes.

```yaml
# Wrong
body:
- type: dropdown
  attributes:
    label: Do you like pie?
    options:
      - Yes
      - No
      - Maybe

# Correct - wrap in quotes
body:
- type: dropdown
  attributes:
    label: Do you like pie?
    options:
      - "Yes"
      - "No"
      - Maybe
```

### Body cannot be empty

The `body` key cannot be empty.

```yaml
# Wrong - document separator causing empty body
name: Support Request
description: Something went wrong
---
body:

# Correct
name: Support Request
description: Something went wrong
body:
- type: textarea
  attributes:
    label: "What's wrong?"
```

---

## Further Reading

- [Issue forms syntax](https://docs.github.com/en/communities/using-templates-to-encourage-useful-contributions/syntax-for-issue-forms)
- [Form schema](https://docs.github.com/en/communities/using-templates-to-encourage-useful-contributions/syntax-for-github-s-form-schema)