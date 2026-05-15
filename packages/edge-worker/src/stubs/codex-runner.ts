export class CodexRunner {
	private messages: any[] = [];
	sessionInfo?: { sessionId?: string };

	handleEvent(event: any): void {
		if (
			event?.type !== "item.completed" ||
			event.item?.type !== "file_change"
		) {
			return;
		}

		const paths = (event.item.changes ?? []).map((change: any) => change.path);
		const relativePaths = paths.map((path: string) =>
			path.replace(/^.*?\/packages\//, "packages/"),
		);
		const targetPath = relativePaths[0] ?? "file";
		const toolUseId = event.item.id ?? "codex-file-change";
		const result = (event.item.changes ?? [])
			.map((change: any) => `${change.kind ?? "update"} ${targetPath}`)
			.join("\n");

		this.messages.push(
			{
				type: "assistant",
				session_id: this.sessionInfo?.sessionId ?? "codex-session",
				message: {
					role: "assistant",
					content: [
						{
							type: "tool_use",
							id: toolUseId,
							name: "Edit",
							input: { file_path: targetPath },
						},
					],
				},
			},
			{
				type: "user",
				session_id: this.sessionInfo?.sessionId ?? "codex-session",
				message: {
					role: "user",
					content: [
						{
							type: "tool_result",
							tool_use_id: toolUseId,
							content: result,
						},
					],
				},
			},
		);
	}

	getMessages(): any[] {
		return this.messages;
	}

	getFormatter(): any {
		return {
			formatToolParameter: (_toolName: string, input: any) =>
				typeof input?.file_path === "string"
					? input.file_path
					: JSON.stringify(input),
			formatToolResult: (
				_toolName: string,
				_input: any,
				result: string,
				_isError: boolean,
			) => result,
			formatToolActionName: (toolName: string) => toolName,
		};
	}
}
export class SimpleCodexRunner {}
