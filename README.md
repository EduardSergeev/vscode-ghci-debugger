# VSCode GHCi Debugger

[![Build Status](https://travis-ci.org/EduardSergeev/vscode-ghci-debugger.svg?branch=master)](https://travis-ci.org/EduardSergeev/vscode-ghci-debugger)

Barebone TypeScript adapter to GHCi Debugger.  

## Installation

Does not depends on any additional packages (except for [Simple GHC (Haskell) Integration](https://marketplace.visualstudio.com/items?itemName=dramforever.vscode-ghc-simple) VSCode extension which is also "barebone").  
Just install it and it should "just work" with a variety of Haskell projects.

## Features

![Debugger](./images/debugger-run.gif)

## Current state

First prelimirary version which *mostly works* but is not yet production ready

## Dependencies

* Automatic dependency (auto install) [Simple GHC (Haskell) Integration](https://marketplace.visualstudio.com/items?itemName=dramforever.vscode-ghc-simple)  
  Note: Depends on [yet to be released version](https://github.com/EduardSergeev/vscode-ghc-simple/tree/feature/api) which exposes public API
