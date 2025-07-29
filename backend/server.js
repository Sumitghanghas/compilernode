  const express = require('express');
  const bodyParser = require('body-parser');
  const fs = require('fs');
  const path = require('path');
  const { spawn } = require('child_process');
  const cors = require('cors');
  const http = require('http');
  const { Server } = require('socket.io');

  const app = express();
  const port = 5000;
  const Temp = path.join(__dirname, 'temp');

  if (!fs.existsSync(Temp)) {
    fs.mkdirSync(Temp);
  }

  app.use(cors());
  app.use(bodyParser.json());

  const server= http.createServer(app);
  const io =new Server(server, { cors: { origin: '*' } });

  const activeProcesses=[];

  function addProcess(socket, process, cleanup) {
    activeProcesses.push({ socket, process, cleanup, waitingForInput: false });
  }

  function getProcess(socket) {
    return activeProcesses.find(p => p.socket === socket);
  }

  function removeProcess(socket) {
    const index = activeProcesses.findIndex(p => p.socket === socket);
    if (index !== -1) {
      const [proc] = activeProcesses.splice(index, 1);
      return proc;
    }
    return null;
  }

  io.on('connection', (socket) => {
    console.log('Client connected');

    socket.on('run_code', ({ language, code }) => {
      runProgram(socket, language, code);
    });

    socket.on('input', (input) => {
      const processData = getProcess(socket);
      if (processData && processData.process) {
        processData.process.stdin.write(input + '\n');
        processData.waitingForInput = false;
      }
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected');
      const processData = removeProcess(socket);
      if (processData) {
        if (processData.process) processData.process.kill();
        cleanupFiles(processData.cleanup);
      }
    });
  });

  async function runProgram(socket, language, code) {
    const unique = Date.now();
    const baseFilename = `code-${unique}`;
    const fileBase = path.join(Temp, baseFilename);
    let sourceFile, runCmd, compileCmd = null, cleanup = [];

    try {
      switch (language) {
        case 'c':
          sourceFile = `${fileBase}.c`;
          fs.writeFileSync(sourceFile, code);
          compileCmd = ['gcc', sourceFile, '-o', `${fileBase}.out`];
          runCmd = [`${fileBase}.out`];
          cleanup.push(sourceFile, `${fileBase}.out`);
          break;
        case 'cpp':
          sourceFile = `${fileBase}.cpp`;
          fs.writeFileSync(sourceFile, code);
          compileCmd = ['g++', sourceFile, '-o', `${fileBase}.out`];
          runCmd = [`${fileBase}.out`];
          cleanup.push(sourceFile, `${fileBase}.out`);
          break;
        case 'java':
          sourceFile = path.join(Temp, `Main${unique}.java`);
          const modifiedCode = code.replace(/public\s+class\s+\w+/, `public class Main${unique}`);
          fs.writeFileSync(sourceFile, modifiedCode);
          compileCmd = ['javac', sourceFile];
          runCmd = ['java', '-cp', Temp, `Main${unique}`];
          cleanup.push(sourceFile, path.join(Temp, `Main${unique}.class`));
          break;
        case 'javascript':
          sourceFile = `${fileBase}.js`;
          fs.writeFileSync(sourceFile, code);
          runCmd = ['node', sourceFile];
          cleanup.push(sourceFile);
          break;
        default:
          socket.emit('error', 'Unsupported language');
          return;
      }

      if (compileCmd) {
        try {
          await runCommand(compileCmd[0], compileCmd.slice(1));
        } catch (error) {
          socket.emit('compile_error', { message: error });
          cleanupFiles(cleanup);
          return;
        }
      }

      const process = spawn(runCmd[0], runCmd.slice(1));
      addProcess(socket, process, cleanup);

      let inputTimer = null;
      let waitingForInput = false;

      function startInputTimer() {
        if (inputTimer) clearTimeout(inputTimer);
        inputTimer = setTimeout(() => {
          if (!process.killed && !waitingForInput) {
            waitingForInput = true;
            socket.emit('input_request');
            const processData = getProcess(socket);
            if (processData) processData.waitingForInput = true;
          }
        }, 300);
      }

      function checkForInputPrompt(output) {
        const promptPatterns = [
          /Enter/i, /Input/i, /:\s*$/, />\s*$/, /\?\s*$/, /Type/i, /Name/i, /Number/i
        ];
        return promptPatterns.some(pattern => pattern.test(output.trim()));
      }

      process.stdout.on('data', (data) => {
const output = data.toString().replace(/\r?\n$/, '');
        socket.emit('output', output);

        waitingForInput = false;
        const processData = getProcess(socket);
        if (processData) processData.waitingForInput = false;

        if (checkForInputPrompt(output)) {
          setTimeout(() => {
            if (!process.killed && !waitingForInput) {
              waitingForInput = true;
              socket.emit('input_request');
              if (processData) processData.waitingForInput = true;
            }
          }, 100);
        } else {
          startInputTimer();
        }
      });

      process.stderr.on('data', (data) => {
        socket.emit('error', data.toString());
      });

      process.on('close', (code) => {
        if (inputTimer) clearTimeout(inputTimer);
        socket.emit('finished', { message: `Process exit` });
        const processData = removeProcess(socket);
        if (processData) cleanupFiles(processData.cleanup);
      });

      process.on('error', (error) => {
        if (inputTimer) clearTimeout(inputTimer);
        socket.emit('error', error.message);
        const processData = removeProcess(socket);
        if (processData) cleanupFiles(processData.cleanup);
      });
      startInputTimer();
    } catch (error) {
      socket.emit('error', error.toString());
      cleanupFiles(cleanup);
    }
  }

  function runCommand(command, args) {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args);
      let stderr = '';
      proc.stderr.on('data', data => { stderr += data.toString(); });
      proc.on('close', code => {
        if (code !== 0) reject(stderr);
        else resolve();
      });
      proc.on('error', err => reject(err.message));
    });
  }

  function cleanupFiles(files) {
    files.forEach(file => {
      if (file && fs.existsSync(file)) {
        try {
          fs.unlinkSync(file);
        } catch (err) {
          console.warn(`Error deleting file ${file}: ${err.message}`);
        }
      }
    });
  }

  server.listen(port, () => {
    console.log(`server run on ${port}`);
  });
