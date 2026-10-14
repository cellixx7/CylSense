import { fireEvent, render, screen } from "@testing-library/react";
import App from "./App";
import { NAV_ITEMS } from "./navigation";

describe("App shell", () => {
  it("renderiza a marca e todos os itens de navegacao", () => {
    render(<App />);
    expect(screen.getByText("CYL Sense")).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Principal" });
    for (const item of NAV_ITEMS) {
      expect(nav).toHaveTextContent(item.label);
    }
  });

  it("abre na Visao geral e navega para outra area", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Visao geral");

    fireEvent.click(screen.getByRole("button", { name: "Video" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Video");
    expect(screen.getByRole("button", { name: "Video" })).toHaveAttribute("aria-current", "page");
  });

  it("Partidas abre a secao real (fora do Tauri explica que o historico e local)", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Partidas" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Partidas");
    expect(screen.getByText(/somente no aplicativo desktop/)).toBeInTheDocument();
  });

  it("a Visao geral nao exibe dados de partidas", () => {
    render(<App />);
    expect(screen.queryByText(/K\/D|ACS|Headshots/i)).not.toBeInTheDocument();
  });
});
