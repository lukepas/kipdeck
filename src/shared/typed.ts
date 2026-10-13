// What the office types into an agent's terminal for someone else: a prompt, a message from another
// agent, a person's reason. It goes inside a bracketed paste, so an escape sequence in it could end
// the paste early and press keys (Ctrl+U, Shift+Tab, Enter) in that agent's session. Nothing that
// reaches a terminal keeps one.

/** Terminal escape sequences (CSI, OSC and the rest that start with ESC), and C1 CSI. */
const ESCAPES = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\)?|[ -/]*[0-~])|\u009b[0-?]*[ -/]*[@-~]/g;
/** The C0 and C1 control characters and DEL, except tab and newline. */
const CONTROLS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]+/g;

/**
 * `text` with line endings as \n and no escape sequence or control character left (tabs and newlines
 * stay): safe to type into a terminal. Controls go after the sequences, so no ESC survives at all.
 */
export const cleanTyped = (text: string): string => text.replace(/\r\n?/g, '\n').replace(ESCAPES, '').replace(CONTROLS, '');
