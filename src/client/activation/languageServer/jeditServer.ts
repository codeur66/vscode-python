// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import { inject, injectable } from 'inversify';
import {
    CancellationToken,
    CodeLens,
    CompletionContext,
    CompletionItem,
    CompletionList,
    DocumentSymbol,
    Event,
    Hover,
    Location,
    LocationLink,
    Position,
    ProviderResult,
    ReferenceContext,
    SignatureHelp,
    SignatureHelpContext,
    SymbolInformation,
    TextDocument,
    WorkspaceEdit
} from 'vscode';

import { IExtensionContext, ILogger, Resource } from '../../common/types';
import { IShebangCodeLensProvider, PythonInterpreter } from '../../interpreter/contracts';
import { IServiceContainer, IServiceManager } from '../../ioc/types';
import { JediFactory } from '../../languageServices/jediProxyFactory';
import { PythonCompletionItemProvider } from '../../providers/completionProvider';
import { PythonDefinitionProvider } from '../../providers/definitionProvider';
import { PythonHoverProvider } from '../../providers/hoverProvider';
import { activateGoToObjectDefinitionProvider } from '../../providers/objectDefinitionProvider';
import { PythonReferenceProvider } from '../../providers/referenceProvider';
import { PythonRenameProvider } from '../../providers/renameProvider';
import { PythonSignatureProvider } from '../../providers/signatureProvider';
import { JediSymbolProvider } from '../../providers/symbolProvider';
import { ITestManagementService } from '../../testing/types';
import { WorkspaceSymbols } from '../../workspaceSymbols/main';
import { IStartableLanguageServer } from '../types';

@injectable()
export class JediServer implements IStartableLanguageServer {
    private readonly context: IExtensionContext;
    private jediFactory?: JediFactory;
    private renameProvider: PythonRenameProvider | undefined;
    private hoverProvider: PythonHoverProvider | undefined;
    private definitionProvider: PythonDefinitionProvider | undefined;
    private referenceProvider: PythonReferenceProvider | undefined;
    private completionProvider: PythonCompletionItemProvider | undefined;
    private codeLensProvider: IShebangCodeLensProvider | undefined;
    private symbolProvider: JediSymbolProvider | undefined;
    private signatureProvider: PythonSignatureProvider | undefined;

    constructor(@inject(IServiceManager) private serviceManager: IServiceManager) {
        this.context = this.serviceManager.get<IExtensionContext>(IExtensionContext);
    }

    public async startup(_resource: Resource, _interpreter?: PythonInterpreter): Promise<void> {
        if (this.jediFactory) {
            throw new Error('Jedi already started');
        }
        const context = this.context;
        const jediFactory = (this.jediFactory = new JediFactory(context.asAbsolutePath('.'), this.serviceManager));
        context.subscriptions.push(jediFactory);
        context.subscriptions.push(...activateGoToObjectDefinitionProvider(jediFactory));
        context.subscriptions.push(jediFactory);
        this.renameProvider = new PythonRenameProvider(this.serviceManager);
        this.definitionProvider = new PythonDefinitionProvider(jediFactory);
        this.hoverProvider = new PythonHoverProvider(jediFactory);
        this.referenceProvider = new PythonReferenceProvider(jediFactory);
        this.completionProvider = new PythonCompletionItemProvider(jediFactory, this.serviceManager);
        this.codeLensProvider = this.serviceManager.get<IShebangCodeLensProvider>(IShebangCodeLensProvider);

        const serviceContainer = this.serviceManager.get<IServiceContainer>(IServiceContainer);
        context.subscriptions.push(new WorkspaceSymbols(serviceContainer));
        this.symbolProvider = new JediSymbolProvider(serviceContainer, jediFactory);
        this.signatureProvider = new PythonSignatureProvider(jediFactory);
        const testManagementService = this.serviceManager.get<ITestManagementService>(ITestManagementService);
        testManagementService
            .activate(this.symbolProvider)
            .catch(ex => this.serviceManager.get<ILogger>(ILogger).logError('Failed to activate Unit Tests', ex));
    }

    public provideRenameEdits(document: TextDocument, position: Position, newName: string, token: CancellationToken): ProviderResult<WorkspaceEdit> {
        if (this.renameProvider) {
            return this.renameProvider.provideRenameEdits(document, position, newName, token);
        }
    }
    public provideDefinition(document: TextDocument, position: Position, token: CancellationToken): ProviderResult<Location | Location[] | LocationLink[]> {
        if (this.definitionProvider) {
            return this.definitionProvider.provideDefinition(document, position, token);
        }
    }
    public provideHover(document: TextDocument, position: Position, token: CancellationToken): ProviderResult<Hover> {
        if (this.hoverProvider) {
            return this.hoverProvider.provideHover(document, position, token);
        }
    }
    public provideReferences(document: TextDocument, position: Position, context: ReferenceContext, token: CancellationToken): ProviderResult<Location[]> {
        if (this.referenceProvider) {
            return this.referenceProvider.provideReferences(document, position, context, token);
        }
    }
    public provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken, _context: CompletionContext): ProviderResult<CompletionItem[] | CompletionList> {
        if (this.completionProvider) {
            return this.completionProvider.provideCompletionItems(document, position, token);
        }
    }
    public get onDidChangeCodeLenses(): Event<void> | undefined {
        return this.codeLensProvider ? this.codeLensProvider.onDidChangeCodeLenses : undefined;
    }
    public provideCodeLenses(document: TextDocument, token: CancellationToken): ProviderResult<CodeLens[]> {
        if (this.codeLensProvider) {
            return this.codeLensProvider.provideCodeLenses(document, token);
        }
    }
    public provideDocumentSymbols(document: TextDocument, token: CancellationToken): ProviderResult<SymbolInformation[] | DocumentSymbol[]> {
        if (this.symbolProvider) {
            return this.symbolProvider.provideDocumentSymbols(document, token);
        }
    }
    public provideSignatureHelp(document: TextDocument, position: Position, token: CancellationToken, _context: SignatureHelpContext): ProviderResult<SignatureHelp> {
        if (this.signatureProvider) {
            return this.signatureProvider.provideSignatureHelp(document, position, token);
        }
    }

    public dispose(): void {
        if (this.jediFactory) {
            this.jediFactory.dispose();
        }
    }
}
