import { createStore } from "solid-js/store";
import { createEffect, createMemo, onCleanup, createRoot } from "solid-js";
import { createStoredSignal } from "../hooks/createStoredSignal";
import type { 
  OperationState, 
  OperationOutput, 
  OperationResult, 
  OperationStatus,
  MultiInstanceWarning 
} from "../types/operations";

// Wrap reactive computations in createRoot for proper disposal
const operationsStore = createRoot(() => {
// Operation state store
  const [operations, setOperations] = createStore<Record<string, OperationState>>({});

  // Current active operations count - automatically calculated using createMemo
  const activeOperationsCount = createMemo(() => {
    return Object.values(operations).filter(op => 
      op.status === 'in-progress' || op.isMinimized
    ).length;
  });

  // Multi-instance warning configuration - using persistent storage
  const [multiInstanceWarning, setMultiInstanceWarning] = createStoredSignal<MultiInstanceWarning>('multiInstanceWarning', {
    enabled: true,
    threshold: 2,
    dismissed: false
  });

  // Operation management Hook
  const useOperations = () => {
    // Add new operation
    const addOperation = (operation: Omit<OperationState, 'createdAt' | 'updatedAt'>) => {
      const now = Date.now();
      const newOperation: OperationState = {
        ...operation,
        createdAt: now,
        updatedAt: now
      };

      setOperations(newOperation.id, newOperation);
      // Active operations count will be automatically updated through createMemo
      
      // Check if multi-instance warning needs to be displayed
      checkMultiInstanceWarning();
    };

    // Remove operation
    const removeOperation = (id: string) => {
      setOperations(id, undefined as any);
      // Active operations count will be automatically updated through createMemo
    };

    // Update operation status
    const updateOperation = (id: string, updates: Partial<OperationState>) => {
      setOperations(id, {
        ...updates,
        updatedAt: Date.now()
      });
    };

    // Add operation output - optimize performance, reduce array creation
    const addOperationOutput = (operationId: string, output: Omit<OperationOutput, 'timestamp'>) => {
      const timestamp = Date.now();
      const newOutput: OperationOutput = { ...output, timestamp };
      
      setOperations(operationId, 'output', (prev = []) => {
        // If approaching limit, directly create new array and truncate
        if (prev.length >= 950) { // Process in advance to avoid frequently reaching 1000 limit
          const updated = prev.slice(-50); // Keep last 50 entries
          updated.push(newOutput);
          return updated;
        }
        // Add directly in normal cases
        return [...prev, newOutput];
      });
    };

    // Set operation result
    const setOperationResult = (operationId: string, result: OperationResult) => {
      updateOperation(operationId, {
        status: result.success ? 'success' : 'error',
        result
      });
    };

    // Toggle minimize status
    const toggleMinimize = (operationId: string) => {
      const operation = operations[operationId];
      if (operation) {
        updateOperation(operationId, {
          isMinimized: !operation.isMinimized
        });
      }
    };

    // Set operation status
    const setOperationStatus = (operationId: string, status: OperationStatus) => {
      updateOperation(operationId, { status });
    };

    // Get active operations
    const getActiveOperations = () => {
      return Object.values(operations).filter(op => 
        op.status === 'in-progress' || op.isMinimized
      );
    };

    // Update active operations count - removed, using createMemo for automatic calculation

    // Check multi-instance warning
    const checkMultiInstanceWarning = () => {
      const warning = multiInstanceWarning();
      const activeCount = activeOperationsCount(); // Use computed property
      
      if (warning.enabled && !warning.dismissed && activeCount >= warning.threshold) {
        return true;
      }
      return false;
    };

    // Dismiss multi-instance warning
    const dismissMultiInstanceWarning = () => {
      setMultiInstanceWarning((prev: MultiInstanceWarning) => ({ ...prev, dismissed: true }));
    };

    // Update multi-instance warning configuration
    const updateMultiInstanceWarning = (updates: Partial<MultiInstanceWarning>) => {
      setMultiInstanceWarning((prev: MultiInstanceWarning) => ({ ...prev, ...updates }));
    };


    return {
      // State
      operations: () => operations,
      activeOperationsCount,
      multiInstanceWarning,

      // Operation methods
      addOperation,
      removeOperation,
      updateOperation,
      addOperationOutput,
      setOperationResult,
      toggleMinimize,
      setOperationStatus,
      getActiveOperations,

      // Warning management
      checkMultiInstanceWarning,
      dismissMultiInstanceWarning,
      updateMultiInstanceWarning,

      // Utility methods
      generateOperationId
    };
  };

  // Periodic cleanup - fix memory leak issue
  createEffect(() => {
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      const cleanupThreshold = 5 * 60 * 1000; // 5 minutes

      Object.entries(operations).forEach(([id, operation]) => {
        if (
          (operation.status === 'success' || operation.status === 'error') &&
          now - operation.updatedAt > cleanupThreshold
        ) {
          setOperations(id, undefined as any);
        }
      });
    }, 60000); // Clean up once per minute
    
    onCleanup(() => {
      clearInterval(cleanupInterval);
    });
  });

  return useOperations;
});

// Generate unique operation ID
export const generateOperationId = (operationType: string): string => {
  return `${operationType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Operation management Hook - export function returned from createRoot
export const useOperations = operationsStore;

