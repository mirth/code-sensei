# Code Sensei
## Natural language code annotation

This VSCode extension annotates code line by line in natural language.

You can install this extension from the [Marketplace](https://marketplace.visualstudio.com/items?itemName=HessdalenLights.code-sensei)

![Example of Code Sensei vscode extension work. It annotates code.](https://raw.githubusercontent.com/mirth/code-sensei/main/example0.png)

## 🚀 Getting Started
To make extension work you should set your OpenAI API key in the extension settings.

You can claim your OpenAI API key [here](https://platform.openai.com/api-keys).
![Place OpenAI API key in the extension settings](https://raw.githubusercontent.com/mirth/code-sensei/main/openaikey.png)

By default extension uses `gpt-4-turbo-preview` model for code analysis but you can change it in the extension settings.

You can also try any ChatGPT model like `gpt-4`, `gpt-4-1106-preview` or `gpt-3.5-turbo-1106`.

The full list of ChatGPT models listed [here the 4th version](https://platform.openai.com/docs/models/gpt-4-and-gpt-4-turbo) and [here the 3.5 version](https://platform.openai.com/docs/models/gpt-3-5).

To annotate the the code line just select it and wait. It will annotate the line and its context.
![Annotation process with vscode extension Code Sensei](https://raw.githubusercontent.com/mirth/code-sensei/main/work-example.gif)
