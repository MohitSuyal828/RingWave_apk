import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";

import { queryClient } from "@/lib/queryClient";
import { router } from "@/router";
import "@/index.css";

import { CallProvider } from "@/context/CallContext";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <CallProvider>
        <RouterProvider router={router} />
      </CallProvider>
    </QueryClientProvider>
  </StrictMode>
);