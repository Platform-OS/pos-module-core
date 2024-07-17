# platformOS Core Module

The goal of this module is to extend the platformOS module system's possibilities.

With the **hook system**, it's possible to use **SOLID's Open/Closed Principle** so you can modify the business logic in other modules in the application folder without changing the source of existing modules.

There is a **variable storage** that can be used to set variables and get their value in the global scope.

You can register your module and theme into the **module registry** with `hook_module_info`. In this info file, you can define your module's name, version, type (module or theme), and dependencies. Module registry will handle **dependency management** and **outdated versions**.

There are **module helper** functions to check if a module or theme exists in the system so that the other modules can use installed ones without complex dependencies.

The core module also provides a command and the graphql mutation for **email sending**.

## Installation

This module is published in Partner Portal Modules Marketplace - https://partners.platformos.com/marketplace/pos_modules/126

To install it, you have to have [pos-cli](https://github.com/mdyd-dev/pos-cli#overview) installed.

Go into your project directory and use `pos-cli modules install` command, which will create/update `app/pos-modules.json`:

`pos-cli modules install core`

### Pulling the source code

Modules are compatible with [platformOS Check](https://github.com/Platform-OS/platformos-lsp#platformos-check----a-linter-for-platformos), which we highly recommend you to install - it's compatible with any IDE supporting LSP. If you use VSCode, see [VSCode platformOS Check Extension](https://marketplace.visualstudio.com/items?itemName=platformOS.platformos-check-vscode).

To be able to leverage LSP features like autocomplete for `function`/`include`/`graphql` tags, you will need to have the source code of the module in your project. We recommended adding `modules/core` into .gitignore (as you should not monkey patch module files, as it will make it hard to update the module to the newest version in the future) and pulling the source code via pos-cli:

`pos-cli modules pull core`

The default behavior of modules is that the files are never deleted. It is assumed that the developers might not have access to all of the files, and thanks to this feature they are still able to overwrite some of the module's files without breaking them. Because the core module is fully public, it is recommended to delete files on deployment. To do it, ensure your app/config.yml includes the core module in the list `modules_that_allow_delete_on_deploy`:

```
modules_that_allow_delete_on_deploy:
- core
```

## Commands / business logic

We recommend using commands to encapsulate business rules. By following our recommendation, you will improve the consistency of your code, so it will be easy to onboard new developers to the project and easier to take over existing projects. The advantage of using this architecture is that it will be easy to re-use the command - you will be able to execute it both in a live web request, as well as a background job.

We recommend placing your commands in `lib/commands` directory.

The naming conventions that we use are `<resource>/<action>`, for example, `users/create.liquid` or `order/cancel.liquid`.

Commands are designed to be easily executed as background jobs [heavy commands - external API call, expensive operations computations, reports]. Each command might produce an [Event](#events)

You can use generator provided by the core module to quickly generate our recommend structure with initial code:

```
pos-cli generate run modules/core/generators/command <command>
```

For example

```
pos-cli generate run modules/core/generators/command dummy/create
```

You can also scaffold the whole CRUD at once, for example:

```
pos-cli generate run modules/core/generators/crud dummy title:string uuid:string c__score:integer --include-views
```

The command consists of 3 stages, which we recommend to split into 3 separate files.

![CommandWorkflow](docs/commands.png)

A typical dummy command placed in `app/lib/commands/dummy/create.liquid` would look like this:

```liquid
{%  liquid
  function object = 'commands/dummy/create/build', object: object
  function object = 'commands/dummy/create/check', object: object

  if object.valid
    function object = 'commands/dummy/create/execute', object: object
  endif

  return object
%}
```

### Build

This is the place where you build input for the command. The typical use case is to invoke it with `context.params`, which include input provided by the user via submitting `<form>`, to normalize the input, do necessary type conversions, whitelist properties that the user is allowed to provide to the command, etc.

Example `app/lib/commands/dummy/build.liquid`:

```liquid
{% parse_json data %}
  {
    "title": {{ object.title | downcase | json }},
    "uuid": {{ object.uuid | json }},
    "c__score": 0
  }
{% endparse_json %}

{% liquid
  if data['uuid'] == blank
    hash_assign data["uuid"] = '' | uuid | json
  endif

  return data
%}
```

The example build command will generate uuid if not provided in params, will initiate the field c__score (c stands for cache) with 0 and will ensure that the title provided to the command is downcased.

### Check

This is the place where you validate the input - for example, you ensure all required fields are provided, you check uniqueness, check the format of the input etc. This always returns hash with two keys - `valid` being either `true` or `false`, and if `false` - `errors` with details why validation has failed.

The core module has already quite a few [built-in validators](#validators).

Example `app/lib/commands/dummy/check.liquid`:

```liquid
{% liquid
  assign c = '{ "errors": {}, "valid": true }' | parse_json

  function c = 'modules/core/validations/presence', c: c, object: object, field_name: 'title'
  function c = 'modules/core/validations/presence', c: c, object: object, field_name: 'uuid'
  if object.title
    function c = 'modules/core/validations/presence', c: c, object: object, field_name: 'title'
    function c = 'modules/core/validations/length', c: c, object: object, field_name: 'title', minimum: 3
    function c = 'modules/core/validations/length', c: c, object: object, field_name: 'title', maximum: 130
  endif

  function c = 'modules/core/validations/uniqueness', c: c, object: object, field_name: 'uuid'

  assign object = object | hash_merge: c

  return object
%}

```

### Execute

  If validation succeeds, proceed with executing the command - usually a single [platformOS GraphQL Mutation](https://documentation.platformos.com/get-started/build-your-first-app/saving-data-to-the-database#save-the-data-in-the-database). Any error raised here should be considered 500 server error. If you allow errors here, it means there is something wrong with the code organisation, as all checks to prevent errors should be done in the `check` step.

Example `app/lib/commands/dummy/execute.liquid`:

```liquid
{% liquid
  graphql r = 'dummy/create', args: object

  assign object = r.record_create
  hash_assign object['valid'] = true

  return object
%}
```

Note: Usually the `execute` step is about invoking a GraphQL mutation - if that's the case for your new command, you can use the generic execute function provided by the core module, which is located at `modules/core/public/lib/commands/execute.liquid`. Example usage to invoke GraphQL mutation defined in `app/graphql/dummy/create.graphql`:

```liquid
{%  liquid
  # ...

  if object.valid
    function object = 'modules/core/commands/execute', mutation_name: 'dummy/create', selection: 'record_create', object: object
  endif

  # ...
%}
```

## Hooks

Hooks allow you and other developers to extend the functionality of your modules or applications without altering the existing code, but by writing a new one. It follows the Open/Close Principle. You achieve it by creating an entry point in a specific point in your application flow, which dynamically executes additional code implemented by matching hooks. 

Hooks are defined via [Liquid partials](https://documentation.platformos.com/developer-guide/glossary#partial) that start with `hook_` prefix. We recommend placing them in `lib/hooks` directory. These partials (hooks) are executed via the core module's `modules/core/commands/hooks/fire` function described below.

Organize your hooks into appropriate folders to maintain a clean project structure:

- **Application Hooks**: Located in `app/lib/hooks/`, e.g., `hook_permission.liquid`
- **Module Hooks**: Located in `modules/your-module/public/lib/hooks/`, e.g., `hook_permission.liquid`

### Implementing Hooks

Implementing a hook means providing the specific logic that should execute when the hook is fired. This is where you define what actually happens when a hook is triggered.

1. **Create Hook Implementation**: For the hook declared as `hook_my-hook.liquid`, create an implementation file in an appropriate directory, such as `app/lib/hooks/hook_my-hook.liquid`. In other words, create a Liquid file named after the hook, such as `hook_HOOKNAME.liquid`.

2. **Add Logic to the Hook**: In your hook implementation file, add the logic that should execute. This could include logging, data manipulation, or any other functionality.

3. **Returning from Hooks**: All hooks are invoked via [function](https://documentation.platformos.com/api-reference/liquid/platformos-tags#function), which means that every hook must use [return](https://documentation.platformos.com/api-reference/liquid/platformos-tags#return) tag, even if it is `return null`.

**Note:** To execute the hook, fire it via `modules/core/commands/hook/fire` function and provide your hook name as an argument - `my-hook`; combination of a naming convention (`hook_` prefix) and using the core module's function turns the Liquid partial into a hook. 

### Declaring and Configuring Hooks

To make a hook available for implementation by others, you need to declare and configure it within your project. This setup allows others to extend and customize your code without altering the core functionality.

To make a hook operational and integrate it into your application’s logic, you must explicitly call it using the `modules/core/commands/hook/fire` function. This involves specifying the hook's name (without `hook_` prefix).

For example, if you have declared a hook named `my-hook` (for example by creating a file `app/lib/hooks/hook_my-hook.liquid`), you fire it as follows:

```liquid
{% liquid
  function results = 'modules/core/commands/hook/fire', hook: 'my-hook'
%}
```

When you fire a hook using the `modules/core/commands/hook/fire` command, the system dynamically searches for all Liquid files that match the pattern `hook_<hook_name>`. If you fire `my-hook`, the system looks for partials whose path ends with `/hook_my-hook`.

Find the [fire.liquid implementation here](https://github.com/Platform-OS/pos-module-core/blob/master/modules/core/public/lib/commands/hook/fire.liquid).

**Parameters and Result Merging**: When firing a hook, you can pass data using the `params` attribute, which will be forwarded to all implementations of the hook. The `merge_to_object` attribute can be used to combine results from different hook implementations into a single object.

### Additional Hook Options

- Define [**alter hooks**](https://github.com/Platform-OS/pos-module-core/blob/master/modules/core/public/lib/commands/hook/alter.liquid) to modify data before it is processed further, such as before saving to the database or rendering to the user.

- **Parameters**: Pass additional data to hooks using the `params` attribute. Params will be sent to all hook implementations.
  
- **Result Merging**: Use the `merge_to_object` attribute to combine results from various hooks into a single object or collect them in an array.

### Examples of Hook Implementations

#### Returning Arrays with Hooks

Consider the example of the [Permission Module](https://github.com/Platform-OS/pos-module-permission), which doesn't require parameters for its `get_permissions` function:

```
{% liquid
  function permissions = 'modules/core/commands/hook/fire', hook: 'permission'
  return permissions
%}
```

This function retrieves all available permissions in your application.

The Permission Module implements its hook with permission-related permissions, so in `modules/permission/public/lib/hooks/hook_permission.liquid` you can find this:

```
{% liquid
  assign permissions = '["permissions.manage"]' | parse_json
  return permissions
%}
```

Similarly, the [User Module](https://github.com/Platform-OS/pos-module-user) includes user-related permissions:

```
{% liquid
  assign permissions = '["user.create", "user.delete", "user.update"]' | parse_json
  return permissions
%}
```

You can create your own permissions by creating a `hook_permission.liquid` file, either in `app/views/partials/hooks/` or within a custom module directory:

```
{% liquid
  assign permissions = '["custom_permission", "another_custom_perm"]' | parse_json
  return permissions
%}
```

When the `permission` hook is fired, it aggregates and returns the following array of permissions from all implementations:

```
["permissions.manage","user.create", "user.delete", "user.update","custom_permission","another_custom_perm"]
```

#### Passing Parameters to Hooks

For example, in the [User Module](https://github.com/Platform-OS/pos-module-user), we created a hook called `user_create`. Here’s how it is set up:

```liquid
assign params = '{}' | parse_json | hash_merge: created_user: user.user, hook_params: hook_params
function results = 'modules/core/commands/hook/fire', hook: 'user_create', params: params, merge_to_object: true
hash_assign user['hook_results'] = results
```

This configuration enables you to execute additional actions when a user is created. You need to create a file (or files) named `hook_user_create.liquid` in the appropriate directory (either within your app or a specific module). This file should contain the custom logic you wish to apply.

For example, you can **store additional values in your custom profile structure** and use the created user's ID as a reference.

Here’s how you could structure your `app/lib/hooks/hook_user_create.liquid` to achieve this:

```liquid
{% parse_json args %}
  {
    "user_id": {{ params.created_user.id | json }},
    "first_name": {{ params.hook_params.first_name | json }},
    "last_name": {{ params.hook_params.last_name | json }},
    "dog_name": {{ params.hook_params.dog_name | json }},
    "favorite_color": {{ params.hook_params.favorite_color | json }}
  }
{% endparse_json %}
{% liquid
  graphql profile = 'profiles/create', args: args
  return profile
%}
```

This script processes additional parameters provided during user creation and updates the user's profile in the database.

Another practical use could be to **subscribe the newly created user to a newsletter** via an API of a third-party service. In this scenario, your `hook_user_create.liquid` file would look like this:

```liquid
{% if params.hook_params.subscribe %}
  {% parse_json data_to_send %}
    {
      "email": {{ params.created_user.email | json }}
    }
  {% endparse_json %}
  {% graphql g, data: data_to_send %}
    mutation ($data: HashObject!)  {
      api_call: api_call_send(
        data: $data
        template: { name: "nl_subscribe" }
      ) {
        response{ status body }
        errors {
          message
        }
      }
    }
  {% endgraphql %}
{% endif %}

{% return nil %}
```

And here's how you can define the API call in `app/api_calls/nl_subscribe.liquid`:

```liquid
---
request_type: "POST"
to: "https://your-api-call.com"
request_headers: '{
  "Content-Type": "application/json"
}'
---
{{ data | json }}

```

This configuration sends a POST request to the specified URL with the user’s email as JSON data, subscribing them to the newsletter.

## Events

Events are a way to organize code. They allow you to add your logic to existing commands. They are executed asynchronously in the background.

### Defining the event

Event has a type and structure. Type of the event has to be unique and as it not scoped. You define an event by creating a file in `app/lib/events/your_event_name`. The type of the event should be the name of something that happened in the past. In metadata, you define the structure of data that is passed to the event. You have to validate if certain parameters are passed.

`app/lib/events/something_happened`

```
---
metadata:
  event:
    foo_id
---
{% liquid
  assign c = '{ "errors": {}, "valid": true }' | parse_json

  function c = 'modules/core/validations/presence', c: c, object: event, field_name: 'foo_id'

  # You can also enhance event object
  hash_assign event['bar'] = 'extra info'

  return c
%}
```

### Publishing event

Once something happened in the application you can publish the event. Events should be published directly from the page or the command.
`app/views/pages/debug.liquid`

```
{% liquid
  assign object = null | hash_merge: foo_id: "12345"
  function _ = 'modules/core/commands/events/publish', type: 'something_happened', object: object
%}
```

Once the event is published we validate if the event exists and is valid. It is stored in activities. So far nothing happens, to consume the event you have to write consumer.

The `publish` command returns [BackgroundJob ID](https://documentation.platformos.com/best-practices/backend-performance/background-jobs). You are able to preview scheduled and running background jobs via pos-cli gui serve -> Background Jobs. BackgroundJobs created via `publish` command will have a naming convention of `modules/core/commands/events/create:<type>`.
Note: Successfully processed jobs are deleted and are not visible in the UI anymore.

### Handling events

To execute code on a particular event you have to write consumer. There can be many consumers in one event. To create a consumer create a file in `app/lib/consumers/<name_of_the_event>/<name_of_your_file>`
Consumer file can also define configuration options:
  - priority - (String, default: default) defines how this consumer should be prioritized. Possible options are: low/default/high.
  - max_attempts - (Int, default: 9) If the consumer fails for whatever reason, platformOS will automatically re-try it after some time (the delay will increase with each unsuccessful attempt), up to 9 retries. This can be useful if consumer for example sends an API call to a third party and there is some kind of a network error. You can specify max amount of retry attempts by providing `max_attempts` argument to the publish command, for example to prevent any retries max_attempts should be set to 0
  - delay - (Float, default: 0) set a delay in minutes for triggering consumer. For time less than a minute, use fractions, for example 0.5 = 30 seconds

`app/lib/consumers/something_happened/do_something.liquid`

```liquid
---
metadata:
  priority: default
  max_attempts: 9
  delay: 0
---
{% liquid
  assign message = 'executed consumer for the event' | append: event
  log message
%}
```

For this example, the event object will look as:

```json
{
  "id": "ActivityStreams::Activity.1382917",
  "uuid": "22ed7654-9521-42dd-b5f0-02e79c03f749",
  "foo_id": "12345",
  "type": "something_happened",
  "date": "2023-03-17T10:42:41.957Z"
  "bar": "extra info"
}
```

Events can be published and consumed by different parties. In the application, you can write a consumer that reacts to events published by the module.

### Debugging events

The core module provides a simple UI to help you preview published events, re-trigger them etc. It is available only in staging environment at `/_events`

## Status handling

You can create a new status with a command so you will have a status history in your entity. When you create a status, the `status_created` event will be published with the status object, so you can create your consumer and set your entity's status cache (for example `c__status`) field.

### Creating a status

```liquid
{% liquid
  function res = 'modules/core/commands/statuses/create', name: 'app.statuses.transactions.succeeded', reference_id: '2', requester_id: 'payment_webhook', reference_schema: 'modules/payments/transaction'
%}
```

You can also set `timestamp` and `payload` if you need.

### Deleting a status

```liquid
{% liquid
  function res = 'modules/core/commands/statuses/delete', id: '75'
%}
```

### Loading a status

```liquid
{% liquid
  function res = 'modules/core/queries/statuses/find', id: '76'
%}
```

### Searching for statuses

```liquid
{% liquid
  function res = 'modules/core/queries/statuses/search', name: 'app.statuses.transactions.succeeded', requester_id: 'stripe_webhook'
%}
```

### Deleting a status

```liquid
{% liquid
  function res = 'modules/core/commands/statuses/delete', id: '75'
%}
```

## Variable storage

You can set a variable with

```
function res = 'modules/core/commands/variable/set', name: 'VARIABLE_NAME', value: 'VARIABLE_VALUE'
```

This function will return the created variable's value.

And you can get a variable value with

```
function variable_va = 'modules/core/queries/variable/find', name: 'VARIABLE_NAME', default: 'DEFAULT_VALUE'
```

You can pass the `type` argument that can be an array, integer, float, boolean, or object.

## Session storage

You can store small data in a session. A session is connected with the current browser session.

```liquid
  assign data = null | hash_merge: bar: 'some value'

  function _ = 'modules/core/commands/session/set, key: 'foo', value: data
  function data = 'modules/core/commands/session/get', key: 'foo'
  function _ = 'modules/core/commands/session/clear', key: 'foo'
```

## Module registry

You can register your module or theme by implementing `hook_module_info` under `lib/hook/`. An info file should look like this:

```
{% parse_json info %}
{
  "name": "pOS Admin",
  "machine_name": "admin",
  "type": "module",
  "version": "1.0.0",
  "dependencies": [
    "core"
  ]
}
{% endparse_json %}

{% return info %}
```

It is possible to list the registered modules and themes with

```
function modules = 'modules/core/queries/registry/search, type: 'module`
function themes = 'modules/core/queries/registry/search, type: 'theme`
function all = 'modules/core/queries/registry/search
```

## Email sending

The core module provides a command for email sending that you can call in your app or other modules:

```
{% parse_json object %}
  {
    "to":      "grievous@example.com",
    "from":    "kenobi@example.com",
    "cc": [],
    "bcc": [],
    "subject": "Hello there!",
    "layout": "path/to/my_layout",
    "partial": "path/to/email_partial",
    "data": { "user": " { "first_name:" "John" } }
  }
{% endparse_json %}
{% function _ = 'modules/core/commands/email/send', object: object %}
```

The code above will send an email from `kenobi@example.com` to `grievous@example.com` with the subject of `Hello there!` using your liquid partial defined in `app/views/partials/path/to/email_partial.liquid` with the layout file defined in `app/views/layouts/path/to/my_layout.liquid`.

You can pass any additional data as part of the `object` and it'll be available in your `app/views/partials/path/to/email_partial.liquid` partial as `data`:

```liquid
<h1>Hello {{ data.user.first_name }}!</h1>
```

Note: By default platformOS does not send real emails from staging environment - please ensure to [Configure test email on your instance](https://documentation.platformos.com/developer-guide/partner-portal/instances/configuring-test-email) to be able to send emails from staging environment.

## Headscripts hook

The core module provides a hook for other modules to register their head scripts (CSS, JS, metadata, etc).
The modules can implement a `hook_headscripts.liquid` file that returns standard HTML, then you can render the aggregated head scripts in your layout using the `headscripts/search` query:
```
<!DOCTYPE html>
<html lang="en">
  <head>
    {% function headscripts = 'modules/core/queries/headscripts/search' %}
    {{ headscripts }}
  </head>
```

The [Theme manager](https://github.com/Platform-OS/pos-module-theme-manager) module uses the same hook to add theme-specific head scripts from the active theme.

## Helpers

You can check if a module or theme is installed on the project:

```
function exists = 'modules/core/queries/module/exists', type: 'module'
```

## Validators

The core module provides some basic helpers for data validation.

These validators can check if all required fields are provided, check uniqueness, data types (numbers are really numbers and not letters), etc. Validators always return a hash with two keys - valid being either true or false, and if false - errors with details of why the validation has failed.

You can find the core validators at `modules/core/public/lib/validations`

## Generators

Core module provides useful generators to quickly create files.

- command



## Contribution

Please check `.git/CONTRIBUTING.md`
