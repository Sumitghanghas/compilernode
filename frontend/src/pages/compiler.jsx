import React, { useState, useEffect, useRef } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { io } from 'socket.io-client';
import './Compiler.css';

const socket = io('http://localhost:5000');

const Theams = ['vs', 'vs-dark', 'hc-black'];

const Compiler = () => {
    const [language, setLanguage] = useState('javascript');
    const [code, setCode] = useState('');
    const [theme, setTheme] = useState('vs');
    const [isRunning, setIsRunning] = useState(false);
    const [outputLines, setOutputLines] = useState([]);
    const outputRef = useRef(null);

    const addToOutput = (text, type = 'output-line') => {
        const lines = text.split('\n');
        setOutputLines(prev => [
            ...prev,
            ...lines.map(line => ({
                text: type === 'input-line' ? ` ${line}` : line,
                type,
            })),
        ]);
    };

    const handleInputSubmit = (value) => {
        if (value.trim()) {
            socket.emit('input', value);
            addToOutput(value, 'input-line');
        }
    };

    const runCode = () => {
        if (isRunning) return;
        setOutputLines([]);
        addToOutput('Starting program');
        setIsRunning(true);
        socket.emit('run_code', { language, code });
    };

    useEffect(() => {
        const snippets = {
            javascript: `console.log("hello world");`,
            c: `#include <stdio.h>

int main() {
    int num1, num2, num3, product;

    printf("Enter first number: ");
    scanf("%d", &num1);
    printf("Enter second number: ");
    scanf("%d", &num2);
    printf("Enter third number: ");
    scanf("%d", &num3);

    product = num1 * num2 * num3;

    printf("The product of %d, %d, and %d is: %d\\n", num1, num2, num3, product);
    return 0;
}`,
            cpp: `#include <iostream>
#include <string>
using namespace std;

int main() {
    string name1, name2;
    cout << "Enter the first name: ";
    getline(cin, name1);
    cout << "Enter the second name: ";
    getline(cin, name2);
    cout << "You entered: " << name1 << " and " << name2 << endl;
    return 0;
}`,
            java: `import java.util.Scanner;

public class SumTenNumbers {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        int sum = 0;
        for (int i = 1; i <= 10; i++) {
            System.out.print("Enter number " + i + ": ");
            int num = scanner.nextInt();
            sum += num;
        }
        System.out.println("The total sum is: " + sum);
        scanner.close();
    }
}`
        };
        setCode(snippets[language]);
    }, [language]);

    useEffect(() => {
        socket.on('output', data => addToOutput(data, 'output-line'));
        socket.on('error', data => {
            addToOutput(data, 'error-line');
            setIsRunning(false);
        });
        socket.on('input_request', () => addToOutput('<input>', 'input-request'));
        socket.on('finished', data => {
            addToOutput(data.message, 'status');
            setIsRunning(false);
        });
        socket.on('compile_error', data => {
            addToOutput('Compilation Error:\\n' + data.message, 'error-line');
            setIsRunning(false);
        });

        return () => socket.removeAllListeners();
    }, []);

    useEffect(() => {
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [outputLines]);

    return (
        <div className={`compiler-container ${theme === 'vs-dark' || theme === 'hc-black' ? 'dark' : ''}`}>
            <div className="top-bar">
                <h2>Online Compiler</h2>
                <div className="controls">
                    <select value={language} onChange={e => setLanguage(e.target.value)}>
                        <option value="javascript">JavaScript</option>
                        <option value="c">C</option>
                        <option value="cpp">C++</option>
                        <option value="java">Java</option>
                    </select>
                    <select value={theme} onChange={e => setTheme(e.target.value)}>
                        {Theams.map(t => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                    <button onClick={runCode}>▶ Run</button>
                </div>
            </div>

            <div className="editor-output">
                <div className="editor-pane">
                    <MonacoEditor
                        height="100%"
                        language={language}
                        theme={theme}
                        value={code}
                        onChange={(value) => setCode(value || '')}
                        options={{ fontSize: 14, minimap: { enabled: false }, automaticLayout: true }}
                    />
                </div>

                <div className="output-pane" ref={outputRef}>
                    {outputLines.map((line, idx) => {
                        if (line.type === 'input-request') {
                            return (
                                <div key={idx} className="output-line input-line">
                                    <span className="prompt-text">
                                        {outputLines[idx - 1]?.text || ''}
                                    </span>
                                    <InputLine onSubmit={handleInputSubmit} />
                                </div>
                            );
                        }

                        if (outputLines[idx + 1]?.type === 'input-request') {
                            return null;
                        }

                        return (
                            <div key={idx} className={line.type}>
                                {line.text}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

const InputLine = ({ onSubmit }) => {
    const [value, setValue] = useState('');
    const inputRef = useRef(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    return (
        <input
            type="text"
            ref={inputRef}
            className="output-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    onSubmit(value);
                    setValue('');
                }
            }}
        />
    );
};

export default Compiler;
