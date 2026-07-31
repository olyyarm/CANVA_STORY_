import { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('CANVA STORY rendering error', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main className="fatal-error" role="alert">
        <div className="fatal-error__card">
          <span>CANVA STORY</span>
          <h1>Интерфейс не смог продолжить работу</h1>
          <p>Локальная копия проекта не удалена. Перезагрузите страницу, чтобы восстановить последнее сохранённое состояние.</p>
          <button type="button" onClick={() => window.location.reload()}>Перезагрузить страницу</button>
        </div>
      </main>
    );
  }
}
