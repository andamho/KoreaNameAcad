' Starts the shorts thumbnail worker supervisor (runtime root) without a window. Called at Windows logon.
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run "cmd.exe /c """ & dir & "\run-worker.cmd""", 0, False
