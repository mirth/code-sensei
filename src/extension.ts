import * as vscode from 'vscode';
import OpenAI from "openai";
import { Buffer } from "buffer";

const openai = new OpenAI({apiKey: ""});

let systemPrompt = "QWN0IGxpa2UgYSBwcm9mZXNzaW9uYWwgcHJvZ3JhbW1lciBhbmQgY29kaW5nIHR1dG9yLgpJJ2xsIHNlbmQgeW91IE4gbGluZXMgb2YgY29kZTsgeW91IG5lZWQgdG8gcmV0dXJuIGV4YWN0bHkgTiBsaW5lcyBvZiBjb21tZW50cy4gRWFjaCBvdXRwdXQgbGluZSBzaG91bGQgYmUgYW4gZXhwbGFuYXRpb24gZm9yIHRoZSBjb3JyZXNwb25kaW5nIGlucHV0IGxpbmUuIEJlIGNvbmNpc2U7IGRvIG5vdCB1c2UgbW9yZSB0aGFuIHR3byBzZW50ZW5jZXMgZm9yIGFuIGV4cGxhbmF0aW9uLgpEbyBub3QgcmV0dXJuIGFueXRoaW5nIGVsc2UuCgpFeGFtcGxlIGlucHV0OgpgYGAKMSQgZGVmIHN1bShhLCBiKToKMiQgICIiInRoaXMgZnVuY3Rpb24gYWRkcyBhIGFuZCBiIiIiCjMkICAgIHJldHVybiBhK2IKYGBgCkV4YW1wbGUgb3V0cHV0OgpgYGAKMSQgVGhlIGZ1bmN0aW9uIGRlZmluaXRpb24uIEZ1bmN0aW9uIHN1bSB0YWtlcyB0d28gaW5wdXQgdmFyaWFibGVzOiBhIGFuZCBiCjIkIFRoZSBkb2NzdHJpbmcgZm9yIHRoZSBmdW5jdGlvbi4KMyQgVGhlIG91dHB1dCBvZiB0aGUgZnVuY3Rpb24uIEZ1bmN0aW9uIHN1bSByZXR1cm5zIGErYgpgYGA=";
systemPrompt = Buffer.from(systemPrompt, 'base64').toString('binary')
const numberOfLinesBefore = 5;
const numberOfLinesAfter = 5;
let IS_FETCHING_ANNOTATION = false;

function newUserPrompt(codeString: string) {
  return codeString.split("\n").map((line, lineNumber) => {
    return `$${lineNumber} ${line}`;
  }).join("\n");
}

async function fetchAnnotations(codeString: string) {
  const userPrompt = newUserPrompt(codeString);
  console.log(`prompt: [\n${[userPrompt]}\n]`)

  IS_FETCHING_ANNOTATION = true;
  const completion = await openai.chat.completions.create({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    model: "gpt-4",
    // model: "gpt-3.5-turbo",
  });
  IS_FETCHING_ANNOTATION = false;

  return completion.choices[0].message.content;
}

function parseAnnotations(annotationsString: string) {
  return annotationsString.split("\n").map((line) => {
    const annotation = line.slice(line.indexOf(" ") + 1);
    return annotation;
  })
}

interface LineRange {
  start: number;
  end: number;
}

const cachedLines = new Set<number>();

function addLineRange(lineRange: LineRange) {
  const newRange = new Array<number>();
  for(let i = lineRange.start; i <= lineRange.end; i++) {
    newRange.push(i);
  }

  const linesToAdd = [...newRange].filter(x => !cachedLines.has(x));

  for(const line of linesToAdd) {
    cachedLines.add(line);
  }

  return [Math.min(...linesToAdd), Math.max(...linesToAdd)];
}

// TODO: optimize
function isContextCached(range: LineRange) {
  for(let i = range.start; i <= range.end; i++) {
    if(!cachedLines.has(i)) {
      return false;
    }
  }

  return true;
}

function newAnnotationDecoration(text: string, lineLength: number, maxLineLength: number) {
  const numberOfSpaces = maxLineLength - lineLength
  const margin = " ".repeat(numberOfSpaces);
  text = `${margin}${text}`;

  const annotationDecoration = vscode.window.createTextEditorDecorationType({
    after: {
      margin: '0 0 0 3em',
      textDecoration: "none; white-space: pre",
      contentText: text,
    },
  });

  return annotationDecoration;
}

function getLongestLineLength(editor: vscode.TextEditor) {
  const lengths: Array<number> = [];

  for(let i = 0; i < editor.document.lineCount; i++) {
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
  const lines = []

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
  if(isContextCached(contextRange)) {
    return;
  }

  const codeString = getContextFor(contextRange, editor);

  const [effectiveBegin, effectiveEnd] = addLineRange({start: contextRange.start, end: contextRange.end});

  const rawAnnotation = await fetchAnnotations(codeString);
  const parsedAnnotation = parseAnnotations(rawAnnotation!);
  const maxLineLength = getLongestLineLength(editor);

  for(let line = effectiveBegin; line <= effectiveEnd; line++) {
    const curLineInParsed = line - contextRange.start;
    const annotationForCurLine = parsedAnnotation[curLineInParsed];
    const range = editor.document.lineAt(line).range;
    const annotationDecoration = newAnnotationDecoration(annotationForCurLine, range.end.character, maxLineLength);

    editor.setDecorations(annotationDecoration, [range]);
  }
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  vscode.window.onDidChangeTextEditorSelection(handleDidChangeTextEditorSelection)
}

// This method is called when your extension is deactivated
export function deactivate() {}
