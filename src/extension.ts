import * as vscode from 'vscode';
import OpenAI from "openai";
import { Buffer } from "buffer";
import path from 'path';
import fs from 'node:fs';


let openaiApiKey: string;
let openaiModel: string;
let openaiTemperature: number;
let numberOfLinesBefore: number;
let numberOfLinesAfter: number;
let annotationLanguage: string;

function updateVSConfig() {
  const config = vscode.workspace.getConfiguration("code-sensei");

  openaiApiKey = config.get("openaiApiKey") as string || "";
  openaiModel = config.get("openaiModel") as string || "gpt-4";
  openaiTemperature = config.get("openaiTemperature") as number || 0.7;
  numberOfLinesBefore = config.get("numberOfLinesBefore") as number || 5;
  numberOfLinesAfter = config.get("numberOfLinesAfter") as number || 5;
  annotationLanguage = config.get("annotationLanguage") as string || "English";
}

updateVSConfig();
vscode.workspace.onDidChangeConfiguration(updateVSConfig);

function openaiApi() {
  return new OpenAI({apiKey: openaiApiKey});
}

function makeSystemPrompt(annotationLanguage: string) {
  const extensionPath = vscode.extensions.getExtension('HessdalenLights.code-sensei')!.extensionUri.path;
  const promptPath = path.join(extensionPath, 'prompt.txt');
  let prompt = fs.readFileSync(promptPath, 'utf8');
  prompt = prompt.replace(/{{LANGUAGE}}/g, annotationLanguage);

  return prompt;
}

let IS_FETCHING_ANNOTATION = false;

function newUserPrompt(codeString: string) {
  return codeString.split("\n").map((line, lineNumber) => {
    return `$${lineNumber} ${line}`;
  }).join("\n");
}

async function fetchAnnotations(codeString: string) {
  const userPrompt = newUserPrompt(codeString);

  IS_FETCHING_ANNOTATION = true;

  const systemPrompt = makeSystemPrompt(annotationLanguage);
  const completion = await openaiApi().chat.completions.create({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    model: openaiModel,
    temperature: openaiTemperature,
  });
  IS_FETCHING_ANNOTATION = false;

  return completion.choices[0].message.content;
}

function parseAnnotations(annotationsString: string) {
  const lines = annotationsString.split("\n");
  const annotations = new Map<number, string>();

  for(let line of lines) {
    line = line.trim();

    if (!line.startsWith("$")) {
      continue;
    }

    const firstSpace = line.indexOf(" ");
    const lineNumber = parseInt(line.slice(1, firstSpace));

    annotations.set(lineNumber, line.slice(firstSpace).trim());
  }

  return annotations;
}

interface LineRange {
  start: number;
  end: number;
}

const annatations = new Map<string, Map<number, vscode.TextEditorDecorationType>>();

function setAnnotationFor(docUri: string, line: number, annotation: vscode.TextEditorDecorationType) {
  if(!annatations.has(docUri)) {
    annatations.set(docUri, new Map<number, vscode.TextEditorDecorationType>());
  }

  const annatationsForDoc = annatations.get(docUri)!;
  annatationsForDoc.set(line, annotation);
}

function getAnnotationFor(docUri: string, line: number) {
  if(!annatations.has(docUri)) {
    return undefined;
  }

  const annatationsForDoc = annatations.get(docUri)!;
  return annatationsForDoc.get(line);
}

function deleteAnnotationFor(docUri: string, line: number) {
  if(!annatations.has(docUri)) {
    return;
  }

  const annatationsForDoc = annatations.get(docUri)!;
  annatationsForDoc.delete(line);
}

function getCachedLinesFor(docUri: string) {
  if(!annatations.has(docUri)) {
    return new Set<number>();
  }

  const annatationsForDoc = annatations.get(docUri)!;

  return new Set([...annatationsForDoc.keys()]);
}

function getEffectiveLineRange(docUri: string, lineRange: LineRange) {
  const cachedLines = getCachedLinesFor(docUri);

  const newRange = new Array<number>();
  for(let i = lineRange.start; i <= lineRange.end; i++) {
    newRange.push(i);
  }

  const linesToAdd = [...newRange].filter(x => !cachedLines.has(x));

  return [Math.min(...linesToAdd), Math.max(...linesToAdd)];
}

// TODO: optimize
function isContextCached(docUri: string, range: LineRange) {
  const cachedLines = getCachedLinesFor(docUri);

  for(let i = range.start; i <= range.end; i++) {
    if(!cachedLines.has(i)) {
      return false;
    }
  }

  return true;
}

function newAnnotationDecoration(text: string, lineLength: number, maxLineLength: number) {
  const numberOfSpaces = maxLineLength - lineLength;
  const margin = " ".repeat(numberOfSpaces);
  text = `${margin}${text}`;

  const annotationDecoration = vscode.window.createTextEditorDecorationType({
    after: {
      margin: '0 0 0 3em',
      textDecoration: "none; white-space: pre; opacity: 0.5;",
      fontStyle: "italic",
      contentText: text,
    },
  });

  return annotationDecoration;
}

function getLongestLineLengthForContext(editor: vscode.TextEditor, line: number) {
  const linesBefore = 10;
  const linesAfter = 10;

  const lengths: Array<number> = [];

  const firstLine = Math.max(line - linesBefore, 0);
  const lastLine = Math.min(line + linesAfter, editor.document.lineCount - 1);

  for(let i = firstLine; i <= lastLine; i++) {
    const range = editor.document.lineAt(i).range;
    lengths.push(range.end.character);
  }

  return Math.max(...lengths);
}

function getContextLineRange(line: number, editor: vscode.TextEditor) {
  const totalLines = numberOfLinesBefore + numberOfLinesAfter + 1;

  let firstLine = Math.max(line - numberOfLinesBefore, 0);
  let lastLine = Math.min(line + numberOfLinesAfter, editor.document.lineCount - 1);

  if(firstLine === 0) {
    lastLine = Math.min(totalLines, editor.document.lineCount - 1);
  }
  if(lastLine === (editor.document.lineCount - 1)) {
    firstLine = Math.max(editor.document.lineCount - totalLines, 0);
  }

  return {start: firstLine, end: lastLine};
}

function getContextFor(lineRange: LineRange, editor: vscode.TextEditor) {
  const lines = [];

  for(let i = lineRange.start; i <= lineRange.end; i++) {
    const {text} = editor.document.lineAt(i);
    lines.push(text);
  }

  return lines.join("\n");
}

async function handleDidChangeTextEditorSelection(e: vscode.TextEditorSelectionChangeEvent) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  if (IS_FETCHING_ANNOTATION) {
    return;
  }

  const currentLine = editor.selection.active.line;
  const contextRange = getContextLineRange(currentLine, editor);
  const docUri = editor.document.uri.toString();

  if(isContextCached(docUri, contextRange)) {
    return;
  }

  const codeString = getContextFor(contextRange, editor);

  const [effectiveBegin, effectiveEnd] = getEffectiveLineRange(docUri, {start: contextRange.start, end: contextRange.end});

  const rawAnnotation = await fetchAnnotations(codeString);
  const parsedAnnotation = parseAnnotations(rawAnnotation!);
  const maxLineLength = getLongestLineLengthForContext(editor, currentLine);

  for(let line = effectiveBegin; line <= effectiveEnd; line++) {
    const curLineInParsed = line - contextRange.start;
    if (!parsedAnnotation.has(curLineInParsed)) {
      continue;
    }

    let annotationForCurLine = parsedAnnotation.get(curLineInParsed)!;
    const range = editor.document.lineAt(line).range;

    const isEmptyLine = editor.document.lineAt(line).text.trim() === "";
    if(isEmptyLine) {
      annotationForCurLine = "";
    }

    const annotationDecoration = newAnnotationDecoration(annotationForCurLine, range.end.character, maxLineLength);

    editor.setDecorations(annotationDecoration, [range]);
    setAnnotationFor(docUri, line, annotationDecoration);
  }
}

function handleDidChangeTextDocument(e: vscode.TextDocumentChangeEvent) {
  for (const change of e.contentChanges) {
    let startLine = change.range.start.line;
    let endLine = change.range.end.line;

    const editor = vscode.window.activeTextEditor;

    if (!editor || editor.document !== e.document) {
      continue;
    }
    const docUri = editor.document.uri.toString();

    for (let i = startLine; i <= endLine; i++) {
      const annotationDecoration = getAnnotationFor(docUri, i);
      if (annotationDecoration === undefined) {
        continue;
      }
      editor.setDecorations(annotationDecoration, []);
      deleteAnnotationFor(docUri, i);
    }
  }
}

function handleDidchangeActiveTextEditor(editor: vscode.TextEditor | undefined) {
  if (editor === undefined) {
    return;
  }

  const docUri = editor.document.uri.toString();
  const cachedLines = getCachedLinesFor(docUri);
  for (const line of cachedLines) {
    const annotationDecoration = getAnnotationFor(docUri, line);
    if (annotationDecoration === undefined) {
      continue;
    }

    const range = editor.document.lineAt(line).range;
    editor.setDecorations(annotationDecoration, [range]);
  }
}


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.window.onDidChangeTextEditorSelection(handleDidChangeTextEditorSelection);
  context.subscriptions.push(disposable);

  disposable = vscode.workspace.onDidChangeTextDocument(handleDidChangeTextDocument);
  context.subscriptions.push(disposable);

  disposable = vscode.window.onDidChangeActiveTextEditor(handleDidchangeActiveTextEditor);
  context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
