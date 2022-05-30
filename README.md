# PlatformOS Core module

Creates the possibility to use SOLID Open/Closed Principle with hook and module system to enable to modify the business logic without changing the core source.

## Usage

You can create new hooks on your modules or inside you `app` folder, it depends on you.

The only thing what you need to do is call `modules/core/hook/fire` function with the `hook` name and optionally you can pass `params` attribute. Params will be send to all hook implementations.

After that, you can create liquid files named with `hook_HOOKNAME.liquid`, and `fire` function will collect all results. It means that these hook implementations have to have `return` tag - it can be `nil` but `return` tag is necessary.

## Examples

### Returning with arrays

For example we don't need params in [Permission module's](https://github.com/hosszukalman/pos-module-permission) `get_permissions` function:

```
{% liquid
  function permissions = 'modules/core/hook/fire', hook: 'permission'
  return permissions
%}
```

and `results` will contain all available permissions in your application.

Permission module implements it's own hook with permission related permission, so in `modules/permission/public/views/partials/hook_permission.liquid` you can find this:

```
{% liquid
  assign permissions = '["permissions.manage"]' | parse_json
  return permissions
%}
```

User module implements the user related permissions:

```
{% liquid
  assign permissions = '["user.create", "user.delete", "user.update"]' | parse_json
  return permissions
%}
```

And you can create your own permissions if you create `hook_permission.liquid` for example in `app/views/partials/hooks/hook_permission.liquid` or in a custom module.

```
{% liquid
  assign permissions = '["custom_permission", "another_custom_perm"]' | parse_json
  return permissions
%}
```

After that, fire `permission` hook will get the following result:

```
["permissions.manage","user.create", "user.delete", "user.update","custom_permission","another_custom_perm"]
```

### Passing params

For example in User module, we created a hook called `user_created`. It seems like that:

```
assign hook_params = '{}' | parse_json | hash_merge: created_user: user.user, original_params: params
function results = 'modules/core/hook/fire', hook: 'user_created', params: hook_params
```

It means that if you want to do something when a user is created, you only need to create a file (or files in different folders or modules, it's up to you) called `hook_user_created` and in this file you add your functionality.

For example you can store additional values in your custom profile structure and you will be able to use the created user's ID as a reference. So your `modules/my_custom_profiles/public/views/partials/hook_user_created.liquid` file would seems like this:

```
{% liquid
  function profile = 'modules/my_custom_profiles/create_profile', user_id: params.created_user.id, dog_name: params.original_params.dog_name, favorite_color: params.original_params.favorite_color

  return nil
%}
```

Or another real world example can be to subscribe the user to a newsletter with calling an API of a 3rd party service. In this case your `hook_user_created.liquid` file would seems like this:

```
{% if params.original_params.subscribe %}
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

Where `app/api_calls/nl_subscribe.liquid` would be something like this:

```
---
request_type: "POST"
to: "https://your-api-call.com"
request_headers: '{
  "Content-Type": "application/json"
}'
---
{{ data | json }}

```
