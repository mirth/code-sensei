# Code Sensei
## Natural language code annotation

This VSCode extension annotates code line by line in natural language.

![Example of Code Sensei vscode extension work. It annotates code.](https://raw.githubusercontent.com/mirth/code-sensei/main/example0.png)

## 🚀 Getting Started
To make extension work you should set your OpenAI API key in the extension settings.

You can claim your OpenAI API key [here](https://platform.openai.com/api-keys).
![Place OpenAI API key in the extension settings](https://raw.githubusercontent.com/mirth/code-sensei/main/openaikey.png)

By default extension uses `gpt-4` model for code analysis but you can change it in the extension settings.

Using `gpt-4` model the annotation appears more precise but the annotation process takes more time.

You can also try the following ChatGPT models for annotation: `gpt-4-1106-preview` and `gpt-3.5-turbo-1106`

To annotate the the code line just select it and wait. It will annotate the line and its context.
![Annotation process with vscode extension Code Sensei](https://raw.githubusercontent.com/mirth/code-sensei/main/work-example.gif)
