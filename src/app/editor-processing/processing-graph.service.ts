import { Injectable, Injector } from '@angular/core';
import { ClassicPreset, GetSchemes, NodeEditor } from 'rete';
import { AreaExtensions, AreaPlugin } from 'rete-area-plugin';
import { ConnectionPlugin, Presets as ConnectionPresets } from 'rete-connection-plugin';
import { AngularArea2D, AngularPlugin, Presets as RenderPresets } from 'rete-angular-plugin';

import { ConfigStoreService, ProcessConfig, ProcessSpec } from '../core/config-store.service';

type Schemes = GetSchemes<
  ClassicPreset.Node,
  ClassicPreset.Connection<ClassicPreset.Node, ClassicPreset.Node>
>;
type AreaExtra = AngularArea2D<Schemes>;

export interface GraphHandle {
  destroy(): Promise<void>;
  /** Re-sync the rete graph from the current processing.json. */
  rebuild(): Promise<void>;
  /** Access the editor for selection / focus operations. */
  editor: NodeEditor<Schemes>;
}

/**
 * Bootstraps a rete v2 editor against the process config in the store and
 * keeps both sides in sync: changes in the store rebuild the graph; user
 * edits to the graph (add / remove node, add / remove connection) write back
 * to the store with markDirty().
 */
@Injectable({ providedIn: 'root' })
export class ProcessingGraphService {
  private socket = new ClassicPreset.Socket('flow');
  /** name → rete node. Kept so we can resolve connections. */
  private nodesByName = new Map<string, ClassicPreset.Node>();

  constructor(private store: ConfigStoreService) {}

  async mount(container: HTMLElement, injector: Injector): Promise<GraphHandle> {
    const editor = new NodeEditor<Schemes>();
    const area = new AreaPlugin<Schemes, AreaExtra>(container);
    const connection = new ConnectionPlugin<Schemes, AreaExtra>();
    const angularRender = new AngularPlugin<Schemes, AreaExtra>({ injector });

    AreaExtensions.selectableNodes(area, AreaExtensions.selector(), {
      accumulating: AreaExtensions.accumulateOnCtrl(),
    });

    angularRender.addPreset(RenderPresets.classic.setup());
    connection.addPreset(ConnectionPresets.classic.setup());

    editor.use(area);
    area.use(connection);
    area.use(angularRender);

    // —— sync graph ➜ store ————————————————————————————————
    // The classic preset emits pipe events for connectioncreated /
    // connectionremoved / noderemoved. We listen and write back.
    editor.addPipe((ctx) => {
      if (!ctx) return ctx;
      switch (ctx.type) {
        case 'connectioncreated':
        case 'connectionremoved':
          this.syncFromGraph(editor);
          break;
      }
      return ctx;
    });

    const rebuild = async () => {
      // Tear down existing nodes / connections.
      for (const c of [...editor.getConnections()]) await editor.removeConnection(c.id);
      for (const n of [...editor.getNodes()]) await editor.removeNode(n.id);
      this.nodesByName.clear();

      const proc = this.store.processing()?.process ?? {};
      const names = Object.keys(proc);

      // Create nodes.
      for (const name of names) {
        const spec = proc[name];
        const node = new ClassicPreset.Node(this.label(name, spec));
        node.addInput('in', new ClassicPreset.Input(this.socket, 'in', true));
        node.addOutput('out', new ClassicPreset.Output(this.socket, 'out'));
        (node as any).__name = name;
        await editor.addNode(node);
        this.nodesByName.set(name, node);
      }

      // Connections: name's require[*] are upstream of name.
      for (const name of names) {
        const spec = proc[name];
        for (const reqName of spec.require ?? []) {
          const upstream = this.nodesByName.get(reqName);
          const downstream = this.nodesByName.get(name);
          if (!upstream || !downstream) continue;
          await editor.addConnection(
            new ClassicPreset.Connection(upstream, 'out', downstream, 'in'),
          );
        }
      }

      await this.autoLayout(area, editor);
      AreaExtensions.zoomAt(area, editor.getNodes());
    };

    await rebuild();

    return {
      editor,
      rebuild,
      async destroy() {
        area.destroy();
      },
    };
  }

  /**
   * Walk the rete graph and rewrite the store's processing config to match.
   * Adds / removes connections by editing each node's `require` field.
   * Doesn't add or remove process entries — those flow store ➜ graph only.
   */
  private syncFromGraph(editor: NodeEditor<Schemes>): void {
    const proc = this.store.processing();
    if (!proc) return;

    const next: ProcessConfig = { process: { ...proc.process } };

    for (const node of editor.getNodes()) {
      const name = (node as any).__name as string | undefined;
      if (!name || !next.process[name]) continue;

      const incoming = editor
        .getConnections()
        .filter((c) => c.target === node.id)
        .map((c) => editor.getNode(c.source))
        .map((n) => (n as any).__name as string | undefined)
        .filter((n): n is string => !!n);

      const spec: ProcessSpec = { ...next.process[name] };
      if (incoming.length > 0) {
        spec.require = incoming;
      } else {
        delete spec.require;
      }
      next.process[name] = spec;
    }

    this.store.processing.set(next);
    this.store.markDirty();
  }

  private async autoLayout(
    area: AreaPlugin<Schemes, AreaExtra>,
    editor: NodeEditor<Schemes>,
  ): Promise<void> {
    // Simple grid layout: place nodes in a 4-col grid by insertion order.
    const cols = 4;
    const dx = 280;
    const dy = 160;
    let i = 0;
    for (const node of editor.getNodes()) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      await area.translate(node.id, { x: col * dx, y: row * dy });
      i++;
    }
  }

  private label(name: string, spec: ProcessSpec): string {
    return spec.op ? `${name} · ${spec.op}` : name;
  }
}
