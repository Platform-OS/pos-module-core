const Generator = require('yeoman-generator');
const path = require('path');
const pluralize = require('pluralize');
const fs = require('fs');

module.exports = class extends Generator {
  constructor(args, opts) {
    super(args, opts);

    this.description = 'Generate basic command files with build and check phase';
    this.argument('commandName', { type: String, required: true, description: 'name of the command' });
    this.props = {
      commandName: this.options.commandName
    };
  }

  writing() {
    try{
      this.fs.copyTpl(
        this.templatePath('./lib/commands/create.liquid'),
        this.destinationPath(`app/lib/commands/${this.props.commandName}.liquid`),
        this.props
      )

      this.fs.copyTpl(
        this.templatePath('./lib/commands/create/'),
        this.destinationPath(`app/lib/commands/${this.props.commandName}/`),
        this.props
      )
    } catch (e) {
      console.error(e);
    }
  }

  end() {
    console.log('Command generated');
  }
};
