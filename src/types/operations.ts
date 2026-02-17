import { ScoopPackage, ScoopInfo } from "./scoop";

export interface OperationNextStep {
    buttonLabel: string;
    onNext: () => void;
}

export interface ModalState {
    operationTitle: string | null;
    operationNextStep: OperationNextStep | null;
    isScanning?: boolean;
}

export interface PackageInfoModalState {
    selectedPackage: ScoopPackage | null;
    info: ScoopInfo | null;
    loading: boolean;
    error: string | null;
}

// 操作输出接口
export interface OperationOutput {
  operationId?: string;
  operation_id?: string; // Support both camelCase and snake_case for compatibility
  line: string;
  source: string; // Support custom source values
  message?: string; // Optional message property
  timestamp: number;
}

// 操作结果接口
export interface OperationResult {
  operationId?: string;
  operation_id?: string; // Support both camelCase and snake_case for compatibility
  success: boolean;
  message: string;
  timestamp: number;
}

// 操作状态
export type OperationStatus = 'in-progress' | 'success' | 'error' | 'cancelled';

// 最小化状态接口
export interface MinimizedState {
  operationId: string;
  isMinimized: boolean;
  showIndicator: boolean;
  title: string;
  result?: OperationStatus;
  timestamp: number;
}

// 操作状态接口
export interface OperationState {
  id: string;
  title: string;
  status: OperationStatus;
  isMinimized: boolean;
  output: OperationOutput[];
  result?: OperationResult;
  createdAt: number;
  updatedAt: number;
  isScan?: boolean;
  nextStep?: OperationNextStep;
  onInstallConfirm?: () => void;
}

// 最小化指示器属性接口
export interface MinimizedIndicatorProps {
  operationId: string;
  title: string;
  status: OperationStatus;
  isMinimized: boolean;
  visible: boolean;
  onClick: () => void;
  onClose?: () => void;
  index?: number; // 用于布局计算
}

// 操作模态框属性接口
export interface OperationModalProps {
  operationId?: string;
  title: string | null;
  onClose: (operationId: string, wasSuccess: boolean) => void;
  nextStep?: OperationNextStep;
  isScan?: boolean;
  onInstallConfirm?: () => void;
}

// 操作队列管理接口
export interface OperationQueue {
  active: OperationState[];
  completed: OperationState[];
  maxConcurrent: number;
}

// 多实例警告配置
export interface MultiInstanceWarning {
  enabled: boolean;
  threshold: number; // 触发警告的操作数量
  dismissed: boolean;
}