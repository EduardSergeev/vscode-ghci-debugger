# Change Log
All notable changes to the "GHCi Debugger" extension will be documented in this file.

## [0.2.0] - 2020-04-21
### Added
* Copy/paste relevant [Simple GHC (Haskell) Integration](https://github.com/dramforever/vscode-ghc-simple) into project since the project is not going to support required public API just yet.
* Use full source range in StackFrame's & Breakpoint's
### Fixed
* Duplicates and sort order of StakTrace
* Fix issues discovered on Windows
* Clean Debug output (only program output should now be there)
* Do not loose any output (everything should be in Debug windows now)

## [0.1.1] - 2020-04-20
### Fixed
* Breakpoints set up and start up

## [0.1.0] - 2020-04-19
### Added
* Initial working version (depends on ***yet to be released*** changes in dependent extension)
