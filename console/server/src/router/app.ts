import { TRPCError } from "@trpc/server";
import { observable } from "@trpc/server/observable";
// import { shell } from "electron";
import uniqby from "lodash.uniqby";
import { z } from "zod";

import { AppStates } from "../utils/cloudAppState.js";
import {
  Node,
  NodeDisplay,
  buildConstructTreeNodeMap,
  NodeConnection,
} from "../utils/constructTreeNodeMap.js";
import {
  QueryNames,
  createProcedure,
  createRouter,
} from "../utils/createRouter.js";
import { ConstructTreeNode } from "../utils/createSimulator.js";
import { BaseResourceSchema, Simulator } from "../wingsdk.js";

export interface ExplorerItem {
  id: string;
  label: string;
  type?: string;
  childItems?: ExplorerItem[];
  display?: NodeDisplay;
}

export const createAppRouter = () => {
  const router = createRouter({
    "app.details": createProcedure.query(({ ctx }) => {
      return ctx.appDetails();
    }),
    "app.logs": createProcedure
      .input(
        z.object({
          filters: z.object({
            level: z.object({
              verbose: z.boolean(),
              info: z.boolean(),
              warn: z.boolean(),
              error: z.boolean(),
            }),
            timestamp: z.number(),
            text: z.string(),
          }),
        }),
      )
      .query(async ({ ctx, input }) => {
        return ctx
          .logs()
          .filter(
            (entry) =>
              input.filters.level[entry.level] &&
              entry.timestamp >= input.filters.timestamp &&
              (!input.filters.text ||
                `${entry.message}${entry.ctx?.sourcePath}`
                  .toLowerCase()
                  .includes(input.filters.text.toLowerCase())),
          );
      }),
    "app.error": createProcedure.query(({ ctx }) => {
      return ctx.errorMessage();
    }),
    "app.explorerTree": createProcedure.query(async ({ ctx }) => {
      const simulator = await ctx.simulator();
      const { tree } = simulator.tree().rawData();
      return createExplorerItemFromConstructTreeNode(tree, simulator);
    }),
    "app.childRelationships": createProcedure
      .input(
        z.object({
          path: z.string().optional(),
        }),
      )
      .query(async ({ ctx, input }) => {
        const simulator = await ctx.simulator();
        const { tree } = simulator.tree().rawData();
        const nodeMap = buildConstructTreeNodeMap(tree);

        const node = nodeMap.get(input.path);
        const children = nodeMap.getAll(node?.children ?? []);
        return children
          .filter((node) => {
            return !node.display?.hidden;
          })
          .map((node) => ({
            node: {
              id: node.id,
              path: node.path,
              type: getResourceType(node, simulator),
              display: node.display,
            },
            inbound:
              node.attributes?.["wing:resource:connections"]
                ?.filter(({ direction, resource }) => {
                  if (direction !== "inbound") {
                    return;
                  }
                  const node = nodeMap.get(resource)!;
                  return !node.display?.hidden;
                })
                .map((connection) => {
                  const node = nodeMap.get(connection.resource)!;
                  return {
                    relationshipType: connection.relationship,
                    node: {
                      id: node.id,
                      path: node.path,
                      type: getResourceType(node, simulator),
                    },
                  };
                }) ?? [],
            outbound:
              node.attributes?.["wing:resource:connections"]
                ?.filter(({ direction, resource }) => {
                  if (direction !== "outbound") {
                    return;
                  }
                  const node = nodeMap.get(resource)!;
                  return !node.display?.hidden;
                })
                .map((connection) => {
                  const node = nodeMap.get(connection.resource)!;
                  return {
                    relationshipType: connection.relationship,
                    node: {
                      id: node.id,
                      path: node.path,
                      type: getResourceType(node, simulator),
                    },
                  };
                }) ?? [],
          }));
      }),
    "app.nodeBreadcrumbs": createProcedure
      .input(
        z.object({
          path: z.string().optional(),
        }),
      )
      .query(async ({ ctx, input }) => {
        const simulator = await ctx.simulator();
        const { tree } = simulator.tree().rawData();
        const nodeMap = buildConstructTreeNodeMap(tree);

        let breadcrumbs: Array<{
          id: string;
          path: string;
          type: string | undefined;
        }> = [];
        nodeMap?.visitParents(input.path, (node) => {
          breadcrumbs = [
            {
              id: node.id,
              path: node.path,
              type: getResourceType(node, simulator),
            },
            ...breadcrumbs,
          ];
        });
        return breadcrumbs;
      }),
    "app.node": createProcedure
      .input(
        z.object({
          path: z.string().optional(),
        }),
      )
      .query(async ({ ctx, input }) => {
        const simulator = await ctx.simulator();
        const { tree } = simulator.tree().rawData();
        const nodeMap = buildConstructTreeNodeMap(tree);
        const node = nodeMap.get(input.path);
        if (!node) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Node was not found.",
          });
        }

        const config = getResourceConfig(node.path, simulator);

        return {
          id: node.id,
          path: node.path,
          type: getResourceType(node, simulator),
          attributes: config?.attrs,
          props: config?.props,
        };
      }),
    "app.nodeMetadata": createProcedure
      .input(
        z.object({
          path: z.string().optional(),
        }),
      )
      .query(async ({ ctx, input }) => {
        const { path } = input;
        if (!path) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Path was not found.",
          });
        }

        const simulator = await ctx.simulator();
        const { tree } = simulator.tree().rawData();
        const nodeMap = buildConstructTreeNodeMap(tree);
        const node = nodeMap.get(path);
        if (!node) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Node was not found.",
          });
        }

        // Since connections may be duplicated, we need to filter them out. While deduplicating,
        // we keep only one connection per resource and direction (because the SDK currently has
        // no way to distinguish between multiple connections to the same resource).
        // Also, we need to filter out connections to hidden nodes.
        const connections = uniqby(
          node.attributes?.["wing:resource:connections"] ?? [],
          (connection) => {
            return `${connection.direction}-${connection.resource}`;
          },
        ).filter((connection) => {
          const node = nodeMap.get(connection.resource);
          return !node?.display?.hidden;
        });

        const config = getResourceConfig(path, simulator);

        return {
          node: {
            id: node.id,
            path: node.path,
            type: getResourceType(node, simulator),
            props: config?.props,
          },
          inbound: connections
            .filter(({ direction }) => {
              return direction === "inbound";
            })
            .map((connection) => {
              const node = nodeMap.get(connection.resource)!;
              return {
                id: node.id,
                path: node.path,
                type: getResourceType(node, simulator),
              };
            }),
          outbound: connections
            .filter(({ direction }) => {
              return direction === "outbound";
            })
            .map((connection) => {
              const node = nodeMap.get(connection.resource)!;
              return {
                id: node.id,
                path: node.path,
                type: getResourceType(node, simulator),
              };
            }),
        };
      }),
    "app.invalidateQuery": createProcedure.subscription(({ ctx }) => {
      return observable<QueryNames>((emit) => {
        ctx.emitter.on("invalidateQuery", emit.next);
        return () => {
          ctx.emitter.off("invalidateQuery", emit.next);
        };
      });
    }),
    "app.map": createProcedure.query(async ({ ctx }) => {
      const simulator = await ctx.simulator();
      const { tree } = simulator.tree().rawData();
      const nodes = [createMapNodeFromConstructTreeNode(tree, simulator)];
      const edges = uniqby(
        createMapEdgeFromConstructTreeNode(tree),
        (edge) => edge.id,
      );

      return {
        nodes,
        edges,
      };
    }),
    "app.state": createProcedure.query(async ({ ctx }) => {
      return ctx.cloudAppStateService.getSnapshot().value as AppStates;
    }),
    "app.openExternal": createProcedure
      .input(
        z.object({
          url: z.string(),
        }),
      )
      .mutation(async ({ input }) => {
        // TODO
        // await shell.openExternal(input.url);
      }),
  });

  return { router };
};

function createExplorerItemFromConstructTreeNode(
  node: ConstructTreeNode,
  simulator: Simulator,
): ExplorerItem {
  return {
    id: node.path,
    label: node.id,
    type: getResourceType(node, simulator),
    display: node.display,
    childItems: node.children
      ? Object.values(node.children)
          .filter((node) => {
            return !node.display?.hidden;
          })
          .map((node) =>
            createExplorerItemFromConstructTreeNode(node, simulator),
          )
      : undefined,
  };
}

interface MapNode {
  id: string;
  data: {
    label?: string;
    type?: string;
    display?: NodeDisplay;
  };
  children?: MapNode[];
}

function createMapNodeFromConstructTreeNode(
  node: ConstructTreeNode,
  simulator: Simulator,
): MapNode {
  return {
    id: node.path,
    data: {
      label: node.id,
      type: getResourceType(node, simulator),
      display: node.display,
    },
    children: node.children
      ? Object.values(node.children)
          .filter((node) => {
            return !node.display?.hidden;
          })
          .map((node) => createMapNodeFromConstructTreeNode(node, simulator))
      : undefined,
  };
}

interface MapEdge {
  id: string;
  source: string;
  target: string;
}

function createMapEdgeFromConstructTreeNode(
  node: ConstructTreeNode,
): MapEdge[] {
  if (node.display?.hidden) {
    return [];
  }

  return [
    ...(node.attributes?.["wing:resource:connections"]
      ?.filter(({ direction }: NodeConnection) => {
        if (direction === "inbound") {
          return true;
        }
      })
      ?.map((connection: NodeConnection) => {
        return {
          id: `${connection.resource} -> ${node.path}`,
          source: connection.resource,
          target: node.path,
        };
      }) ?? []),
    ...(Object.values(node.children ?? {})?.map((child) =>
      createMapEdgeFromConstructTreeNode(child),
    ) ?? []),
  ].flat();
}

/**
 * Return the config for a specific resource, or undefined if it doesn't exist.ç
 */
function getResourceConfig(
  path: string,
  simulator: Simulator,
): BaseResourceSchema | undefined {
  try {
    return simulator.getResourceConfig(path);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Resource ") &&
      error.message.endsWith(" not found.")
    ) {
      // Just ignore this error.
    } else {
      throw error;
    }
  }
}

function getResourceType(
  node: Node | ConstructTreeNode,
  simulator: Simulator,
): string {
  return (
    // WARNING: This is for test purposes only.
    // There's no way to reflect custom resource types in the simulator, so
    // we use a fake wing:console:type attribute. We should remove it at some
    // point.
    node.attributes?.["wing:console:type"] ??
    getResourceConfig(node.path, simulator)?.type ??
    node.constructInfo?.fqn ??
    "constructs.Construct"
  );
}
